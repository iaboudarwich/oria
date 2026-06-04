-- Round 14.6 (backfill): pattern-memory substrate + connect-privacy gate.
--
-- Schema reality (verified against the live DB 2026-06-04, project
-- kygbucpsgconskpxqlmk):
--   - public.user_patterns does NOT exist yet (this creates it).
--   - public.profiles has no connect_privacy_ack_at column yet (added here).
--   - touch_updated_at() trigger fn exists (0001) and is reused.
--   - learning_events + audit_log exist; pattern observations ride on already-
--     audited source events (suggestion.* and the logged Ask), so we audit only
--     the first time a pattern key is learned (pattern.learned, in app code).
--
-- Rollback: drop table public.user_patterns;
--   alter table public.profiles drop column connect_privacy_ack_at.

------------------------------------------------------------------------------
-- 1. user_patterns
--    Per-user behavioral substrate that Round 20 and the suggestion-learning
--    loop will consume. One row per (user, pattern_type, pattern_key) with a
--    score that is reinforced on observation and decayed by the daily cron when
--    unreinforced, so stale behavior fades. score is unbounded-positive in the
--    DB; consumers read the lazily-decayed effective score.
------------------------------------------------------------------------------
create table if not exists public.user_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pattern_type text not null,
  pattern_key text not null,
  score numeric not null default 0,
  observation_count int not null default 0,
  last_observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pattern_type, pattern_key)
);

alter table public.user_patterns enable row level security;

create policy user_patterns_read_own on public.user_patterns
  for select using (user_id = auth.uid());
create policy user_patterns_write_own on public.user_patterns
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger user_patterns_touch_updated_at
  before update on public.user_patterns
  for each row execute function public.touch_updated_at();

create index if not exists user_patterns_owner_idx
  on public.user_patterns (user_id, pattern_type);

-- Decay scans by recency across all users (service role), so index the clock.
create index if not exists user_patterns_decay_idx
  on public.user_patterns (last_observed_at);

------------------------------------------------------------------------------
-- 2. profiles.connect_privacy_ack_at
--    Set the first time a user acknowledges the privacy step before connecting
--    any data source. Null = not yet acknowledged (show the gate). Once set,
--    Connect proceeds directly.
------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists connect_privacy_ack_at timestamptz;

notify pgrst, 'reload schema';
