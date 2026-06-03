-- Round 16: the intelligent daily loop on Today.
--
-- Schema reality (verified against the live DB on 2026-06-03, project
-- kygbucpsgconskpxqlmk):
--   - public.profiles is the user table; it has NO timezone column yet, so we
--     add one here (F4 needs per-user-local 21:00 scheduling, and a cron has no
--     access to the client-side oria_tz cookie).
--   - public.organizations is the space (context) a card/routine belongs to.
--   - public.audit_log exists; the new mutations below are audit-logged in app
--     code (routine.*, journal.created, suggestion.*, today.*).
--   - touch_updated_at() trigger fn exists (0001_init) and is reused here.
--   - none of today_pinned_cards / routines / daily_journals exist yet.
--
-- Rollback: drop table public.today_pinned_cards, public.routines,
--   public.daily_journals; alter table public.profiles drop column timezone.

------------------------------------------------------------------------------
-- 0. profiles.timezone + profiles.locale
--    timezone: IANA name (e.g. "Europe/Paris"), backfilled from the oria_tz
--    cookie on visit. Nullable: users we have not seen in a tz-capable session
--    fall back to UTC for scheduling.
--    locale: UI language (en/ar/fr/es), backfilled from the request locale on
--    visit, so the cron can localize push bodies (which have no request
--    session). Nullable: falls back to en.
------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists timezone text;

alter table public.profiles
  add column if not exists locale text;

------------------------------------------------------------------------------
-- 1. today_pinned_cards
--    Cards materialized onto a user's Today surface for a specific local day.
--    Two producers today: F6 roll-forward (card_kind='rollover', one per
--    unfinished reminder) and user pins. The partial unique index makes the
--    roll-forward idempotent: re-running can never duplicate a card for the
--    same source row on the same day.
------------------------------------------------------------------------------
create table if not exists public.today_pinned_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  card_kind text not null check (card_kind in ('rollover', 'suggestion', 'routine', 'note')),
  source_table text,
  source_id uuid,
  for_date date not null,
  title text,
  href text,
  position int not null default 0,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.today_pinned_cards enable row level security;

create policy today_cards_read_own on public.today_pinned_cards
  for select using (user_id = auth.uid());
create policy today_cards_write_own on public.today_pinned_cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Idempotency for system-materialized cards (roll-forward, routines): one card
-- per source row, per user, per day. Notes (source_id null) are exempt.
create unique index if not exists today_cards_dedup_idx
  on public.today_pinned_cards (user_id, organization_id, card_kind, source_id, for_date)
  where source_id is not null;

create index if not exists today_cards_day_idx
  on public.today_pinned_cards (user_id, organization_id, for_date)
  where dismissed_at is null;

------------------------------------------------------------------------------
-- 2. routines
--    Self-organizing daily rituals. Time-based kinds (morning_briefing,
--    weekly_review, yesterday_recap) fire from the hourly cron when the user's
--    local hour matches local_hour (and, for weekly_review, day_of_week).
--    pre_meeting_prep fires lead_minutes ahead of a calendar event; last_ref_id
--    holds the last prepped event id so the same meeting is never prepped
--    twice. custom routines carry a user prompt. Each run's text is generated
--    through the Conversation AI seam and stored in last_summary for Today.
------------------------------------------------------------------------------
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in (
    'morning_briefing', 'weekly_review', 'yesterday_recap', 'pre_meeting_prep', 'custom'
  )),
  title text not null,
  prompt text,
  enabled boolean not null default true,
  local_hour int check (local_hour between 0 and 23),
  day_of_week int check (day_of_week between 0 and 6),
  lead_minutes int check (lead_minutes between 0 and 1440),
  last_run_at timestamptz,
  last_summary text,
  last_seen_at timestamptz,
  last_ref_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.routines enable row level security;

create policy routines_read_own on public.routines
  for select using (user_id = auth.uid());
create policy routines_write_own on public.routines
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger routines_touch_updated_at
  before update on public.routines
  for each row execute function public.touch_updated_at();

-- Cron scans enabled, non-deleted routines by kind.
create index if not exists routines_active_idx
  on public.routines (kind, enabled)
  where deleted_at is null;

create index if not exists routines_owner_idx
  on public.routines (user_id, organization_id)
  where deleted_at is null;

------------------------------------------------------------------------------
-- 3. daily_journals
--    One reflective entry per user, per space, per local day, written at 21:00
--    local through the Conversation AI seam. The unique key makes the journal
--    cron idempotent: a second pass on the same day updates rather than
--    duplicates.
------------------------------------------------------------------------------
create table if not exists public.daily_journals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  journal_date date not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (user_id, organization_id, journal_date)
);

alter table public.daily_journals enable row level security;

create policy journals_read_own on public.daily_journals
  for select using (user_id = auth.uid());
create policy journals_write_own on public.daily_journals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists daily_journals_owner_idx
  on public.daily_journals (user_id, organization_id, journal_date desc);

notify pgrst, 'reload schema';
