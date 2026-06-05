-- Round 17.x: Rituals + streaks with a freeze. Completes the Health surface.
--
-- A ritual is a recurring thing the user wants to do (daily, or on chosen
-- weekdays): meditate, read, no phone after 10pm. Modeled as its own user-owned
-- type rather than bent onto trackables (which model renewals/expiries with
-- cost + renewal_date; daily recurrence + completions + streaks don't fit).
--
-- 1. rituals: the definition. user-scoped (a private habit), tied to a space
--    for context. cadence is 'daily' or 'weekly' (weekly uses `days`, 0=Sun..
--    6=Sat). Optional reminder_time (HH:MM) is materialized into a one-shot
--    reminder each scheduled local day by the daily-loop cron (it reuses the
--    reminders table; no new reminder system). last_reminder_date / last_eval_date
--    are the cron's per-local-day idempotency guards.
-- 2. ritual_completions: one row per ritual per local day it was marked done.
--    completed_date is the user's LOCAL day key (computed app-side), so streak
--    math is timezone-correct and "done today" is a trivial lookup. The unique
--    (ritual_id, completed_date) makes marking done idempotent.
--
-- Streaks (current/best) and freezes are COMPUTED from completions + cadence
-- (lib/rituals/streak.ts), never stored, so they cannot drift.
--
-- Privacy: both are the user's own rows. RLS is full CRUD scoped to the owner
-- (user_id = auth.uid()); the UI mutates with the user's session.
--
-- Idempotent (create-if-not-exists + drop-policy-if-exists), safe to re-apply.
--
-- Rollback: drop table public.ritual_completions; drop table public.rituals;

create table if not exists public.rituals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  cadence text not null default 'daily' check (cadence in ('daily', 'weekly')),
  days int[] not null default '{0,1,2,3,4,5,6}',
  reminder_time text,
  last_reminder_date date,
  last_eval_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists rituals_user_idx
  on public.rituals (user_id)
  where archived_at is null;

alter table public.rituals enable row level security;

drop policy if exists rituals_rw_own on public.rituals;
create policy rituals_rw_own on public.rituals
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.ritual_completions (
  id uuid primary key default gen_random_uuid(),
  ritual_id uuid not null references public.rituals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  completed_date date not null,
  created_at timestamptz not null default now(),
  unique (ritual_id, completed_date)
);

create index if not exists ritual_completions_ritual_idx
  on public.ritual_completions (ritual_id, completed_date desc);

alter table public.ritual_completions enable row level security;

drop policy if exists ritual_completions_rw_own on public.ritual_completions;
create policy ritual_completions_rw_own on public.ritual_completions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
