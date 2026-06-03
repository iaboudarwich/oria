-- Round 15 F5: Web Push subscriptions.
--
-- Schema reality (verified against the live DB on 2026-06-03):
--   - public.push_subscriptions does NOT exist yet (this creates it).
--   - public.profiles is the user table (user_id FK target, matching the
--     convention in 0061_user_ai_connections and elsewhere).
--   - public.audit_log exists; create/delete are audit-logged in app code
--     (push.subscribed / push.unsubscribed).
--
-- One row per browser push endpoint. `endpoint` is globally unique (the push
-- service URL identifies the device/browser); re-subscribing upserts on it.
-- p256dh + auth are the subscription's public encryption keys (not secrets in
-- the credential sense, but still user data, so RLS-scoped to the owner).
--
-- RLS: a user can only ever see or write their own rows. The server send path
-- uses the service-role admin client to read a target user's subscriptions.
--
-- Rollback: drop table public.push_subscriptions.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy push_subs_read_own on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy push_subs_write_own on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

notify pgrst, 'reload schema';
