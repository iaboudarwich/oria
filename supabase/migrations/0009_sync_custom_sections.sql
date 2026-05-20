-- Oria: defensive sync migration for custom-section infrastructure.
--
-- The app code (lib/data/upload-actions.ts, lib/data/all-sections.ts, etc.)
-- relies on tables and columns introduced in migrations 0006, 0007, and 0008.
-- If any of those migrations were skipped or partially applied, PostgREST
-- returns errors like:
--
--   "Could not find the 'custom_section_id' column of 'uploads' in the
--    schema cache."
--
-- This migration is *idempotent and non-destructive*. It re-asserts the
-- expected schema using `IF NOT EXISTS` everywhere, so it is safe to run on a
-- fresh database (acts as a one-shot bring-up) and equally safe to run on a
-- database that already had 0006/0007/0008 applied (it becomes a no-op apart
-- from refreshing PostgREST's schema cache at the end).
--
-- Apply via `supabase db push` or paste into the SQL Editor. After it runs,
-- the PostgREST cache is reloaded; the app will be able to write the
-- custom_section_id column without restart.

------------------------------------------------------------------------------
-- 1. custom_sections (per organization)
------------------------------------------------------------------------------
create table if not exists public.custom_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  icon text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists custom_sections_org_idx
  on public.custom_sections(organization_id);

-- updated_at trigger (uses public.touch_updated_at from 0001_init).
drop trigger if exists custom_sections_touch on public.custom_sections;
create trigger custom_sections_touch
  before update on public.custom_sections
  for each row execute function public.touch_updated_at();

------------------------------------------------------------------------------
-- 2. custom_sections.profile (added in 0007). Holds the wizard answers.
------------------------------------------------------------------------------
alter table public.custom_sections
  add column if not exists profile jsonb not null default '{}'::jsonb;

------------------------------------------------------------------------------
-- 3. RLS for custom_sections
------------------------------------------------------------------------------
alter table public.custom_sections enable row level security;

drop policy if exists "custom_sections_read_members" on public.custom_sections;
create policy "custom_sections_read_members"
  on public.custom_sections for select
  using (public.is_org_member(organization_id));

drop policy if exists "custom_sections_insert_members" on public.custom_sections;
create policy "custom_sections_insert_members"
  on public.custom_sections for insert
  to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "custom_sections_update_members" on public.custom_sections;
create policy "custom_sections_update_members"
  on public.custom_sections for update
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "custom_sections_delete_members" on public.custom_sections;
create policy "custom_sections_delete_members"
  on public.custom_sections for delete
  using (public.is_org_member(organization_id));

------------------------------------------------------------------------------
-- 4. uploads.custom_section_id — the column the app is failing on right now.
------------------------------------------------------------------------------
alter table public.uploads
  add column if not exists custom_section_id uuid
    references public.custom_sections(id) on delete set null;

create index if not exists uploads_custom_section_idx
  on public.uploads(organization_id, custom_section_id);

------------------------------------------------------------------------------
-- 5. Reminder source tracking (from 0006). Re-asserted defensively.
------------------------------------------------------------------------------
do $$ begin
  create type public.reminder_source as enum ('manual', 'suggested', 'system');
exception when duplicate_object then null; end $$;

alter table public.reminders
  add column if not exists source public.reminder_source not null default 'manual',
  add column if not exists confirmed_at timestamptz;

create index if not exists reminders_source_idx
  on public.reminders(organization_id, source, done);

------------------------------------------------------------------------------
-- 6. section_settings — per-org ordering + visibility for both built-in
--    sections and custom_sections (from 0008).
------------------------------------------------------------------------------
create table if not exists public.section_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  builtin_section public.section,
  custom_section_id uuid references public.custom_sections(id) on delete cascade,
  sort_order integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (builtin_section is not null and custom_section_id is null) or
    (builtin_section is null and custom_section_id is not null)
  )
);

create unique index if not exists section_settings_builtin_unique
  on public.section_settings(organization_id, builtin_section)
  where builtin_section is not null;
create unique index if not exists section_settings_custom_unique
  on public.section_settings(organization_id, custom_section_id)
  where custom_section_id is not null;

create index if not exists section_settings_org_order_idx
  on public.section_settings(organization_id, sort_order);

drop trigger if exists section_settings_touch on public.section_settings;
create trigger section_settings_touch
  before update on public.section_settings
  for each row execute function public.touch_updated_at();

alter table public.section_settings enable row level security;

drop policy if exists "section_settings_read_members" on public.section_settings;
create policy "section_settings_read_members"
  on public.section_settings for select
  using (public.is_org_member(organization_id));

drop policy if exists "section_settings_write_members" on public.section_settings;
create policy "section_settings_write_members"
  on public.section_settings for insert
  to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "section_settings_update_members" on public.section_settings;
create policy "section_settings_update_members"
  on public.section_settings for update
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "section_settings_delete_members" on public.section_settings;
create policy "section_settings_delete_members"
  on public.section_settings for delete
  using (public.is_org_member(organization_id));

------------------------------------------------------------------------------
-- 7. Refresh PostgREST schema cache.
--
-- Without this, PostgREST may continue to serve the previous schema view for
-- up to ~10 minutes (depending on its poll interval), even though the columns
-- and tables already exist. The NOTIFY tells PostgREST to reload immediately.
-- Safe to run regardless of whether anything above actually changed.
------------------------------------------------------------------------------
notify pgrst, 'reload schema';
