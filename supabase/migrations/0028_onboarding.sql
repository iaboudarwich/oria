-- Tracks which one-time onboarding hints a user has dismissed.
-- Row per (user, hint_key) — presence means "dismissed".
create table if not exists public.user_onboarding (
  user_id  uuid not null references auth.users(id) on delete cascade,
  hint_key text not null,
  seen_at  timestamptz not null default now(),
  primary key (user_id, hint_key)
);

-- RLS: each user can only see/write their own rows
alter table public.user_onboarding enable row level security;

create policy "onboarding_owner_all" on public.user_onboarding
  for all using (user_id = auth.uid());

-- Index for the "have I seen this hint?" check
create index if not exists user_onboarding_user_idx
  on public.user_onboarding(user_id);
