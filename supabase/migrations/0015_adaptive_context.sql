-- Oria: foundation for adaptive organizational intelligence.
--
-- Two pieces:
--   1. Per-org "context" for each section. Today this stores keywords +
--      purpose that drive a fully data-driven classifier (no more hardcoded
--      regex ladders). Tomorrow it absorbs more learned signal.
--   2. learning_events: append-only behavioural log. Every meaningful user
--      correction (moves, dismissals, keeps, search queries) writes a tiny
--      row here. Future model-training jobs read from this log; the UI never
--      surfaces it.
--
-- Both pieces are invisible to the user. Idempotent. Safe to re-run.

------------------------------------------------------------------------------
-- 1. section_settings.context
--    Free-form jsonb so we can grow the schema without migrations. Today
--    callers read .keywords (string[]) and .purpose (string).
------------------------------------------------------------------------------
alter table public.section_settings
  add column if not exists context jsonb not null default '{}'::jsonb;

------------------------------------------------------------------------------
-- 2. learning_events
--    One row per user action that carries training signal. Cheap to write,
--    cheap to query later by org + kind. We keep this small: an actor, a
--    kind, and a payload jsonb. No FK constraints on payload contents so
--    deletions elsewhere never cascade in here.
------------------------------------------------------------------------------
create table if not exists public.learning_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists learning_events_org_idx
  on public.learning_events(organization_id, created_at desc);
create index if not exists learning_events_kind_idx
  on public.learning_events(organization_id, kind, created_at desc);

alter table public.learning_events enable row level security;

-- Members of the org can both write (their own actions) and read (so future
-- in-app analytics can show patterns back to the user, with no extra plumbing
-- needed if/when we surface that).
drop policy if exists "learning_events_read_members" on public.learning_events;
create policy "learning_events_read_members"
  on public.learning_events for select
  using (public.is_org_member(organization_id));

drop policy if exists "learning_events_insert_members" on public.learning_events;
create policy "learning_events_insert_members"
  on public.learning_events for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and (actor_id is null or actor_id = auth.uid())
  );

-- No update / delete policies: events are append-only.

notify pgrst, 'reload schema';
