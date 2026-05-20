-- Oria: custom sections + reminder source tracking.
-- Lets users add their own buckets (Taxes, School, Pets, ...) alongside the
-- built-in sections, and distinguishes manually-created reminders from those
-- suggested by the upload pipeline.

------------------------------------------------------------------------------
-- Custom sections (per organization)
------------------------------------------------------------------------------
create table if not exists public.custom_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  icon text,                       -- optional icon key, e.g. 'home', 'tag'
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists custom_sections_org_idx
  on public.custom_sections(organization_id);

drop trigger if exists custom_sections_touch on public.custom_sections;
create trigger custom_sections_touch before update on public.custom_sections
  for each row execute function public.touch_updated_at();

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
-- Uploads: optional custom section reference (mutually exclusive at the app
-- layer with the built-in section enum).
------------------------------------------------------------------------------
alter table public.uploads
  add column if not exists custom_section_id uuid
    references public.custom_sections(id) on delete set null;

create index if not exists uploads_custom_section_idx
  on public.uploads(organization_id, custom_section_id);

------------------------------------------------------------------------------
-- Reminders source: manual, suggested by Oria, or system-generated.
-- confirmed_at lets users accept a suggested reminder, after which it stops
-- showing the "Suggested" affordance.
------------------------------------------------------------------------------
do $$ begin
  create type public.reminder_source as enum ('manual', 'suggested', 'system');
exception when duplicate_object then null; end $$;

alter table public.reminders
  add column if not exists source public.reminder_source not null default 'manual',
  add column if not exists confirmed_at timestamptz;

create index if not exists reminders_source_idx
  on public.reminders(organization_id, source, done);
