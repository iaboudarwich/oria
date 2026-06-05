-- Round 17: Health unified + WHOOP. Two tables.
--
-- 1. whoop_connections: one WHOOP account per user. Tokens are encrypted at
--    rest (AES-256-GCM via lib/security/token-crypto), exactly like the Gmail
--    and Google cloud connections; the DB never holds plaintext tokens. WHOOP
--    ROTATES the refresh token on every refresh, so the refresh path rewrites
--    BOTH columns (see lib/whoop/connections.ts).
--
-- 2. health_metrics: one row per user per local day per source, holding the
--    daily aggregates Oria surfaces (recovery, sleep, day strain + energy,
--    resting heart rate, heart-rate variability, steps when a source provides
--    them). The (user_id, metric_date, source) unique key makes the WHOOP sync
--    idempotent: re-pulling a day UPSERTs the same row instead of duplicating.
--
-- Privacy: both are the user's own data. RLS is SELECT-own; all writes go
-- through the service role (connect, refresh, sync, disconnect), so there is
-- deliberately no INSERT/UPDATE policy for authenticated, matching
-- trusted_devices (0077).
--
-- Idempotent by design (create-if-not-exists + drop-policy-if-exists) so it is
-- safe to apply more than once.
--
-- Rollback: drop table public.health_metrics; drop table public.whoop_connections;

create table if not exists public.whoop_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  whoop_user_id text not null,
  email text,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'paused', 'revoked', 'error')),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  unique (user_id)
);

create index if not exists whoop_connections_user_idx
  on public.whoop_connections (user_id, status);

alter table public.whoop_connections enable row level security;

drop policy if exists whoop_connections_select_own on public.whoop_connections;
create policy whoop_connections_select_own on public.whoop_connections
  for select to authenticated using (user_id = auth.uid());

create table if not exists public.health_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  metric_date date not null,
  source text not null default 'whoop',
  recovery_score smallint,
  resting_heart_rate smallint,
  hrv_milli numeric,
  sleep_performance smallint,
  sleep_total_minutes integer,
  sleep_efficiency smallint,
  day_strain numeric,
  day_kilojoule numeric,
  avg_heart_rate smallint,
  steps integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, metric_date, source)
);

create index if not exists health_metrics_user_date_idx
  on public.health_metrics (user_id, metric_date desc);

alter table public.health_metrics enable row level security;

drop policy if exists health_metrics_select_own on public.health_metrics;
create policy health_metrics_select_own on public.health_metrics
  for select to authenticated using (user_id = auth.uid());
