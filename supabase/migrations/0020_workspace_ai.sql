-- Oria: Workspace AI agent + collaboration.
--
-- Three changes:
--
--   1. memberships.title — optional free-text role label per member,
--      e.g. "Property manager", "Lawyer", "Broker". The existing
--      access_level column still owns permission scope; title is for
--      display only.
--
--   2. workspace_context — one row per office Workspace. Carries the
--      AI agent's standing instructions, the user-written description
--      of what this Workspace is for, and optional preferences
--      (metrics, report style). Personal/circle orgs ignore this.
--
--   3. workspace_reports — generated operational reports for a
--      Workspace. Stores a structured payload (sections, optional
--      chart series) the UI can render without re-calling Claude.
--
-- All changes are idempotent: safe to re-run.

------------------------------------------------------------------------------
-- 1. memberships.title
------------------------------------------------------------------------------
alter table public.memberships
  add column if not exists title text;

------------------------------------------------------------------------------
-- 2. workspace_context — one row per office org. Acts as the AI agent's
--    persistent operational context for the Workspace.
------------------------------------------------------------------------------
create table if not exists public.workspace_context (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  description text,                      -- "This Workspace manages Office Building A…"
  ai_instructions text,                  -- "Focus on tenant leases, parking revenue…"
  preferred_metrics jsonb not null default '[]'::jsonb,   -- ["nopi","occupancy",…]
  preferred_report_style text,           -- "executive" / "detailed" / "monthly-brief"
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.workspace_context enable row level security;

drop policy if exists "workspace_context_read_members" on public.workspace_context;
create policy "workspace_context_read_members"
  on public.workspace_context for select
  using (public.is_org_member(organization_id));

drop policy if exists "workspace_context_write_members" on public.workspace_context;
create policy "workspace_context_write_members"
  on public.workspace_context for insert
  to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "workspace_context_update_members" on public.workspace_context;
create policy "workspace_context_update_members"
  on public.workspace_context for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

------------------------------------------------------------------------------
-- 3. workspace_reports — generated operational reports.
--
-- A report's payload is a json document with this shape (validated by the
-- generator; not enforced at DB level so the shape can evolve):
--   {
--     "summary": "...",
--     "sections": [
--       { "heading": "...", "body": "...", "bullets": ["…"] },
--       { "heading": "...", "chart": { "kind": "bar"|"line", "series": [...] } }
--     ],
--     "key_metrics": [{ "label": "...", "value": "...", "delta": "..." }]
--   }
--
-- status: 'pending' | 'ready' | 'failed'.  The generator marks 'ready'
-- once payload is filled in; 'failed' carries an error_message.
------------------------------------------------------------------------------
create table if not exists public.workspace_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  kind text not null default 'summary',  -- "summary"|"finance"|"leases"|"forecast"|"custom"
  prompt text,                            -- the user-typed brief
  period_start date,
  period_end date,
  payload jsonb,
  status text not null default 'pending',
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_reports_org_idx
  on public.workspace_reports(organization_id, created_at desc);

alter table public.workspace_reports enable row level security;

drop policy if exists "workspace_reports_read_members" on public.workspace_reports;
create policy "workspace_reports_read_members"
  on public.workspace_reports for select
  using (public.is_org_member(organization_id));

drop policy if exists "workspace_reports_insert_members" on public.workspace_reports;
create policy "workspace_reports_insert_members"
  on public.workspace_reports for insert
  to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "workspace_reports_update_members" on public.workspace_reports;
create policy "workspace_reports_update_members"
  on public.workspace_reports for update
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "workspace_reports_delete_members" on public.workspace_reports;
create policy "workspace_reports_delete_members"
  on public.workspace_reports for delete
  to authenticated
  using (public.is_org_member(organization_id));

notify pgrst, 'reload schema';
