-- F3: customizable sections (hide, rename any section) + a renamable "Things"
-- area + a one-time Personal-space cleanup.
--
-- DESIGN NOTE (deviation from the brief's literal SQL):
-- The brief proposed adding `hidden` and `custom_label` to custom_sections.
-- But system (builtin) sections are NOT rows in custom_sections, so columns
-- there cannot make system sections hideable or renamable, which the feature
-- requires. The existing `section_settings` table already keys BOTH builtin
-- (builtin_section) and custom (custom_section_id) sections and already powers
-- `hidden` (migration 0008). So the rename label belongs there too: one column,
-- uniform behavior across every section kind, single source of truth. We do
-- NOT duplicate `hidden` onto custom_sections (that would be a second, divergent
-- source of truth for the same fact).

alter table public.section_settings
  add column if not exists custom_label text;

-- Per-org label override for the "Things" (entity types) area, and a one-time
-- flag guarding the Personal cleanup below so it never re-hides a section the
-- user has since chosen to un-hide.
alter table public.organizations
  add column if not exists things_label text,
  add column if not exists legacy_sections_hidden_at timestamptz;

-- One-time: hide the builtin "Properties" section for EXISTING Personal spaces.
-- Personal users were shown estate-management sections by default. New Personal
-- workspaces get this through applyTemplate(); this backfills the ones already
-- created. The NOT EXISTS guard preserves any explicit choice the user has
-- already made for that section (the unique index on (org, builtin_section)
-- is partial, so ON CONFLICT can't be used here).
insert into public.section_settings (organization_id, builtin_section, hidden, sort_order)
select o.id, 'properties', true, 20
from public.organizations o
where o.kind = 'personal'
  and o.legacy_sections_hidden_at is null
  and not exists (
    select 1
    from public.section_settings ss
    where ss.organization_id = o.id
      and ss.builtin_section = 'properties'
  );

update public.organizations
set legacy_sections_hidden_at = now()
where kind = 'personal'
  and legacy_sections_hidden_at is null;
