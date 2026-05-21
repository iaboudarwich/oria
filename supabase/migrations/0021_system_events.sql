-- Oria: system_events — operator-visible diagnostic log.
--
-- We needed somewhere durable to capture WHAT failed (Anthropic 429,
-- Resend "domain not verified", report generation timeout) so the Admin
-- page can show a real picture instead of just env-var presence checks.
-- learning_events is product-shaped (user actions); system_events is
-- ops-shaped (platform health).
--
-- Severity is a free-text label with a soft enum convention:
--   • "info"  — successful AI call, successful email send, etc.
--               Used for usage-tracking summaries.
--   • "warn"  — degraded but recoverable (extraction skipped, rate
--               limit hit but request still served the user).
--   • "error" — request failed, user impact.
--
-- RLS: service role only. Regular org members and even owners can't
-- read these — they're for the platform operator, gated through the
-- ADMIN_EMAILS-driven admin page in the app.
--
-- Idempotent. Safe to re-run.

create table if not exists public.system_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  severity text not null default 'info',
  message text,
  context jsonb not null default '{}'::jsonb,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists system_events_created_idx
  on public.system_events(created_at desc);
create index if not exists system_events_kind_idx
  on public.system_events(kind, created_at desc);
create index if not exists system_events_severity_idx
  on public.system_events(severity, created_at desc);

alter table public.system_events enable row level security;

-- No SELECT / INSERT / UPDATE / DELETE policies for the public role.
-- Reads and writes go exclusively through the service-role admin
-- client (lib/data/system-events.ts), which is only invoked from the
-- admin-gated page and from background ops paths.

notify pgrst, 'reload schema';
