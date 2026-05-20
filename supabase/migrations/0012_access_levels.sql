-- Oria: simple per-member access levels + per-item visibility.
--
-- Four access levels (memberships.access_level):
--   owner    — full control: members, sections, settings.
--   full     — sees every shared item in the circle.
--   limited  — sees only items in their allowed sections + items specifically
--              shared with them.
--   assigned — sees only items specifically shared/assigned to them.
--
-- Three item visibilities (uploads.visibility, reminders.visibility):
--   private  — only the uploader/creator sees it.
--   circle   — every member who is allowed to see this section/area sees it.
--   specific — only the user IDs listed in shared_with (uploads) or
--              assigned_to (reminders) sees it, in addition to the creator.
--
-- Personal space is just one member (the owner). Personal items default to
-- 'private'. Circle items default to 'circle'.
--
-- Idempotent. Safe to re-run.

------------------------------------------------------------------------------
-- 1. Enums
------------------------------------------------------------------------------
do $$ begin
  create type public.access_level as enum ('owner', 'full', 'limited', 'assigned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.visibility as enum ('private', 'circle', 'specific');
exception when duplicate_object then null; end $$;

------------------------------------------------------------------------------
-- 2. Memberships gain access_level
------------------------------------------------------------------------------
alter table public.memberships
  add column if not exists access_level public.access_level not null default 'full';

-- Backfill: existing owners stay owners. Personal space members are always
-- owners (single-member orgs).
update public.memberships m
set access_level = 'owner'
where m.role = 'owner' and m.access_level = 'full';

------------------------------------------------------------------------------
-- 3. Invites carry the intended access_level
------------------------------------------------------------------------------
alter table public.invites
  add column if not exists access_level public.access_level not null default 'full';

------------------------------------------------------------------------------
-- 4. Uploads gain visibility + shared_with
------------------------------------------------------------------------------
alter table public.uploads
  add column if not exists visibility public.visibility not null default 'circle',
  add column if not exists shared_with uuid[] not null default '{}';

-- Backfill: items in personal spaces become 'private' (only uploader sees).
update public.uploads u
set visibility = 'private'
from public.organizations o
where u.organization_id = o.id
  and o.kind = 'personal'
  and u.visibility = 'circle';

create index if not exists uploads_shared_with_idx
  on public.uploads using gin (shared_with);

------------------------------------------------------------------------------
-- 5. Reminders gain visibility + assigned_to
------------------------------------------------------------------------------
alter table public.reminders
  add column if not exists visibility public.visibility not null default 'circle',
  add column if not exists assigned_to uuid
    references public.profiles(id) on delete set null;

update public.reminders r
set visibility = 'private'
from public.organizations o
where r.organization_id = o.id
  and o.kind = 'personal'
  and r.visibility = 'circle';

------------------------------------------------------------------------------
-- 6. Section allowlist for "limited" members
------------------------------------------------------------------------------
create table if not exists public.membership_sections (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  builtin_section public.section,
  custom_section_id uuid references public.custom_sections(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (builtin_section is not null and custom_section_id is null) or
    (builtin_section is null and custom_section_id is not null)
  )
);

create unique index if not exists membership_sections_builtin_unique
  on public.membership_sections(membership_id, builtin_section)
  where builtin_section is not null;
create unique index if not exists membership_sections_custom_unique
  on public.membership_sections(membership_id, custom_section_id)
  where custom_section_id is not null;

------------------------------------------------------------------------------
-- 7. SECURITY DEFINER helpers used by the new RLS policies
------------------------------------------------------------------------------
create or replace function public.my_access_level(org uuid)
returns public.access_level
language sql stable security definer
set search_path = public
as $$
  select access_level from public.memberships
  where organization_id = org and user_id = auth.uid()
  limit 1
$$;

-- Is the given upload in a section the current user has been granted access to?
create or replace function public.upload_in_my_sections(p_upload_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.uploads u
    join public.memberships m
      on m.organization_id = u.organization_id
     and m.user_id = auth.uid()
    join public.membership_sections ms
      on ms.membership_id = m.id
     and (
       (ms.builtin_section is not null and ms.builtin_section = u.section)
       or (ms.custom_section_id is not null and ms.custom_section_id = u.custom_section_id)
     )
    where u.id = p_upload_id
  )
$$;

create or replace function public.upload_shared_with_me(p_upload_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.uploads
    where id = p_upload_id and auth.uid() = any(shared_with)
  )
$$;

------------------------------------------------------------------------------
-- 8. New RLS policies for uploads
------------------------------------------------------------------------------
drop policy if exists "uploads_read_members" on public.uploads;
drop policy if exists "uploads_read_v2" on public.uploads;

create policy "uploads_read_v2" on public.uploads for select
using (
  -- The uploader always sees their own files.
  uploaded_by = auth.uid()
  or (
    public.is_org_member(organization_id)
    and visibility <> 'private'
    and (
      -- Owners and Full members see every non-private item.
      public.my_access_level(organization_id) in ('owner', 'full')
      or (
        -- Limited: items in their sections + items specifically shared.
        public.my_access_level(organization_id) = 'limited'
        and (
          (visibility = 'circle' and public.upload_in_my_sections(id))
          or (visibility = 'specific' and public.upload_shared_with_me(id))
        )
      )
      or (
        -- Assigned-only: only specifically shared items.
        public.my_access_level(organization_id) = 'assigned'
        and visibility = 'specific'
        and public.upload_shared_with_me(id)
      )
    )
  )
);

------------------------------------------------------------------------------
-- 9. New RLS policies for reminders
------------------------------------------------------------------------------
drop policy if exists "reminders_read_members" on public.reminders;
drop policy if exists "reminders_read_v2" on public.reminders;

create policy "reminders_read_v2" on public.reminders for select
using (
  -- Creator and assignee always see the reminder.
  created_by = auth.uid()
  or assigned_to = auth.uid()
  or (
    public.is_org_member(organization_id)
    and visibility = 'circle'
    and public.my_access_level(organization_id) in ('owner', 'full')
  )
);

-- Update policy: limited/assigned members can mark a reminder assigned to
-- them as done, but can't edit anyone else's.
drop policy if exists "reminders_update_members" on public.reminders;
create policy "reminders_update_v2" on public.reminders for update
using (
  created_by = auth.uid()
  or assigned_to = auth.uid()
  or (
    public.is_org_member(organization_id)
    and public.my_access_level(organization_id) in ('owner', 'full')
  )
)
with check (
  public.is_org_member(organization_id)
);

------------------------------------------------------------------------------
-- 10. RLS on the new membership_sections table
------------------------------------------------------------------------------
alter table public.membership_sections enable row level security;

drop policy if exists "ms_read" on public.membership_sections;
create policy "ms_read" on public.membership_sections for select
using (
  exists (
    select 1 from public.memberships m
    where m.id = membership_id
      and (
        m.user_id = auth.uid()
        or public.org_role(m.organization_id) = 'owner'
      )
  )
);

drop policy if exists "ms_insert" on public.membership_sections;
create policy "ms_insert" on public.membership_sections for insert
to authenticated
with check (
  exists (
    select 1 from public.memberships m
    where m.id = membership_id
      and public.org_role(m.organization_id) = 'owner'
  )
);

drop policy if exists "ms_delete" on public.membership_sections;
create policy "ms_delete" on public.membership_sections for delete
using (
  exists (
    select 1 from public.memberships m
    where m.id = membership_id
      and public.org_role(m.organization_id) = 'owner'
  )
);

-- 11. PostgREST schema cache reload.
notify pgrst, 'reload schema';
