-- Oria: initial schema, RLS policies, and storage setup.
-- Run in the Supabase SQL editor, or via the Supabase CLI.

------------------------------------------------------------------------------
-- Extensions
------------------------------------------------------------------------------
create extension if not exists pgcrypto;

------------------------------------------------------------------------------
-- Enums
------------------------------------------------------------------------------
do $$ begin
  create type public.role as enum (
    'owner', 'assistant', 'staff', 'household', 'accountant', 'external'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.section as enum (
    'household', 'travel', 'properties', 'staff', 'events',
    'finance', 'legal', 'personal', 'vendors', 'health'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_kind as enum (
    'upload', 'ai', 'reminder', 'approval', 'event',
    'staff', 'travel', 'property', 'household', 'schedule'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.upload_status as enum (
    'received', 'processing', 'filed', 'failed'
  );
exception when duplicate_object then null; end $$;

------------------------------------------------------------------------------
-- Profiles (one row per auth user)
------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------------------
-- Organizations
------------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------------------
-- Memberships
------------------------------------------------------------------------------
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.role not null default 'owner',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists memberships_user_idx on public.memberships(user_id);
create index if not exists memberships_org_idx on public.memberships(organization_id);

------------------------------------------------------------------------------
-- Uploads
------------------------------------------------------------------------------
create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  storage_path text not null,
  filename text not null,
  mime_type text,
  size_bytes bigint,
  section public.section,
  title text,
  status public.upload_status not null default 'received',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists uploads_org_idx
  on public.uploads(organization_id, created_at desc);
create index if not exists uploads_section_idx
  on public.uploads(organization_id, section);

------------------------------------------------------------------------------
-- Timeline events
------------------------------------------------------------------------------
create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind public.event_kind not null,
  title text not null,
  detail text,
  upload_id uuid references public.uploads(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists timeline_org_idx
  on public.timeline_events(organization_id, created_at desc);

------------------------------------------------------------------------------
-- Reminders
------------------------------------------------------------------------------
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  due_at timestamptz,
  done boolean not null default false,
  upload_id uuid references public.uploads(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists reminders_org_idx
  on public.reminders(organization_id, done, due_at);

------------------------------------------------------------------------------
-- Helper functions used in RLS policies. SECURITY DEFINER to avoid recursion
-- through the memberships table while evaluating its own policies.
------------------------------------------------------------------------------
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = org
      and user_id = auth.uid()
  );
$$;

create or replace function public.org_role(org uuid)
returns public.role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.memberships
  where organization_id = org and user_id = auth.uid()
  limit 1;
$$;

------------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up.
------------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------
-- updated_at helper trigger
------------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists organizations_touch on public.organizations;
create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();

drop trigger if exists uploads_touch on public.uploads;
create trigger uploads_touch before update on public.uploads
  for each row execute function public.touch_updated_at();

------------------------------------------------------------------------------
-- Row-level security
------------------------------------------------------------------------------

-- profiles ------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own"
  on public.profiles for select
  using (id = auth.uid());

drop policy if exists "profiles_read_members" on public.profiles;
create policy "profiles_read_members"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.memberships m1
      join public.memberships m2 on m1.organization_id = m2.organization_id
      where m1.user_id = auth.uid()
        and m2.user_id = profiles.id
    )
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- organizations -------------------------------------------------------------
alter table public.organizations enable row level security;

drop policy if exists "orgs_read_members" on public.organizations;
create policy "orgs_read_members"
  on public.organizations for select
  using (public.is_org_member(id));

drop policy if exists "orgs_insert_authenticated" on public.organizations;
create policy "orgs_insert_authenticated"
  on public.organizations for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "orgs_update_owner" on public.organizations;
create policy "orgs_update_owner"
  on public.organizations for update
  using (public.org_role(id) = 'owner')
  with check (public.org_role(id) = 'owner');

-- memberships ---------------------------------------------------------------
alter table public.memberships enable row level security;

drop policy if exists "memberships_read_own" on public.memberships;
create policy "memberships_read_own"
  on public.memberships for select
  using (user_id = auth.uid());

drop policy if exists "memberships_read_same_org" on public.memberships;
create policy "memberships_read_same_org"
  on public.memberships for select
  using (public.is_org_member(organization_id));

-- Allow the creator of a new org to add themselves as a member.
drop policy if exists "memberships_insert_self" on public.memberships;
create policy "memberships_insert_self"
  on public.memberships for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "memberships_insert_owner" on public.memberships;
create policy "memberships_insert_owner"
  on public.memberships for insert
  to authenticated
  with check (public.org_role(organization_id) = 'owner');

drop policy if exists "memberships_update_owner" on public.memberships;
create policy "memberships_update_owner"
  on public.memberships for update
  using (public.org_role(organization_id) = 'owner')
  with check (public.org_role(organization_id) = 'owner');

drop policy if exists "memberships_delete_owner" on public.memberships;
create policy "memberships_delete_owner"
  on public.memberships for delete
  using (public.org_role(organization_id) = 'owner');

-- uploads -------------------------------------------------------------------
alter table public.uploads enable row level security;

drop policy if exists "uploads_read_members" on public.uploads;
create policy "uploads_read_members"
  on public.uploads for select
  using (public.is_org_member(organization_id));

drop policy if exists "uploads_insert_members" on public.uploads;
create policy "uploads_insert_members"
  on public.uploads for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and uploaded_by = auth.uid()
  );

drop policy if exists "uploads_update_owner_or_uploader" on public.uploads;
create policy "uploads_update_owner_or_uploader"
  on public.uploads for update
  using (
    public.is_org_member(organization_id)
    and (uploaded_by = auth.uid() or public.org_role(organization_id) = 'owner')
  );

drop policy if exists "uploads_delete_owner_or_uploader" on public.uploads;
create policy "uploads_delete_owner_or_uploader"
  on public.uploads for delete
  using (
    public.is_org_member(organization_id)
    and (uploaded_by = auth.uid() or public.org_role(organization_id) = 'owner')
  );

-- timeline ------------------------------------------------------------------
alter table public.timeline_events enable row level security;

drop policy if exists "timeline_read_members" on public.timeline_events;
create policy "timeline_read_members"
  on public.timeline_events for select
  using (public.is_org_member(organization_id));

drop policy if exists "timeline_insert_members" on public.timeline_events;
create policy "timeline_insert_members"
  on public.timeline_events for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and (actor_id is null or actor_id = auth.uid())
  );

-- reminders -----------------------------------------------------------------
alter table public.reminders enable row level security;

drop policy if exists "reminders_read_members" on public.reminders;
create policy "reminders_read_members"
  on public.reminders for select
  using (public.is_org_member(organization_id));

drop policy if exists "reminders_insert_members" on public.reminders;
create policy "reminders_insert_members"
  on public.reminders for insert
  to authenticated
  with check (
    public.is_org_member(organization_id)
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "reminders_update_members" on public.reminders;
create policy "reminders_update_members"
  on public.reminders for update
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

------------------------------------------------------------------------------
-- Storage bucket: uploads
-- Path convention: {organization_id}/{upload_id}/{filename}
------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 52428800)  -- 50 MB
on conflict (id) do nothing;

drop policy if exists "uploads_storage_read" on storage.objects;
create policy "uploads_storage_read"
  on storage.objects for select
  using (
    bucket_id = 'uploads'
    and name ~ '^[0-9a-f-]{36}/'
    and public.is_org_member((split_part(name, '/', 1))::uuid)
  );

drop policy if exists "uploads_storage_insert" on storage.objects;
create policy "uploads_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'uploads'
    and name ~ '^[0-9a-f-]{36}/'
    and public.is_org_member((split_part(name, '/', 1))::uuid)
  );

drop policy if exists "uploads_storage_delete" on storage.objects;
create policy "uploads_storage_delete"
  on storage.objects for delete
  using (
    bucket_id = 'uploads'
    and name ~ '^[0-9a-f-]{36}/'
    and public.is_org_member((split_part(name, '/', 1))::uuid)
    and owner = auth.uid()
  );
