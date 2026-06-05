-- 0087_write_actions.sql
-- Round 21: the write-back framework's record. Every Oria-performed mutation
-- (propose -> confirm -> execute -> undo window) writes one row here, keyed by
-- the CLIENT-supplied action id, which gives idempotency (a retry/double-tap
-- with the same id cannot double-execute) and the undo payload needed to fully
-- reverse it. Audit lives in audit_log; this is the operational + undo store.
--
-- Schema-reality checked (0086 applied): no write_actions table exists.
-- Rollback: DROP TABLE public.write_actions;

create table if not exists public.write_actions (
  id uuid primary key,                       -- client-supplied action id (idempotency)
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  type text not null,
  summary text not null default '',          -- the confirmed plain-language statement
  status text not null default 'pending'
    check (status in ('pending', 'executed', 'undone', 'failed')),
  target_table text,
  target_id uuid,
  undo jsonb not null default '{}'::jsonb,    -- enough to reverse the action
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  undone_at timestamptz
);

alter table public.write_actions enable row level security;

-- Own-row: a user sees and manages only their own actions. Writes go through
-- the service-role runner, but the read policy lets a user see their history.
create policy write_actions_read_own on public.write_actions
  for select using (user_id = auth.uid());

create index if not exists write_actions_user_idx
  on public.write_actions(user_id, created_at desc);
