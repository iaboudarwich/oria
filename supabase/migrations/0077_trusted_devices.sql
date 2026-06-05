-- Round 16.7: low-friction sign-in. A "trusted device" lets a returning user
-- skip the second-factor step on a device they've already verified, while the
-- second factor still appears on new devices, after long inactivity, and for
-- sensitive actions.
--
-- Security model: the device holds only a random secret in an httpOnly cookie;
-- the DB stores its SHA-256 hash, never the secret. Trust EXPIRES (expires_at),
-- is explicitly created (the user checks "remember this device" after passing
-- the second factor), and is revocable from Settings (revoked_at).
--
-- Rollback: drop table public.trusted_devices.

create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create unique index if not exists trusted_devices_token_idx
  on public.trusted_devices (token_hash);
create index if not exists trusted_devices_user_idx
  on public.trusted_devices (user_id)
  where revoked_at is null;

alter table public.trusted_devices enable row level security;

-- The owner can see and revoke their own devices. Inserts happen via the
-- service role at sign-in time (trust is created after the second factor
-- passes), so there is deliberately no INSERT policy for authenticated.
create policy trusted_devices_select_own on public.trusted_devices
  for select to authenticated using (user_id = auth.uid());
create policy trusted_devices_update_own on public.trusted_devices
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
