-- Oria: per-org section ordering + visibility.
-- One row per (org, built-in section) or (org, custom section). Rows are
-- created lazily the first time the user moves or hides a section; sections
-- with no row use the canonical default order and are visible.

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

-- Exactly one settings row per (org, section). Built-in and custom use
-- separate partial-unique indexes because nulls are not equal in a regular
-- unique constraint.
create unique index if not exists section_settings_builtin_unique
  on public.section_settings(organization_id, builtin_section)
  where builtin_section is not null;
create unique index if not exists section_settings_custom_unique
  on public.section_settings(organization_id, custom_section_id)
  where custom_section_id is not null;

create index if not exists section_settings_org_order_idx
  on public.section_settings(organization_id, sort_order);

drop trigger if exists section_settings_touch on public.section_settings;
create trigger section_settings_touch before update on public.section_settings
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
