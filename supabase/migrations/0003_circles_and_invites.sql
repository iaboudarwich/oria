-- Oria: introduce the Circle concept and invitations.
-- This migration is non-destructive. Existing personal workspaces become
-- kind = 'personal'. Future circle / office modes share the same container
-- table; only the UI changes.

------------------------------------------------------------------------------
-- Org kind enum
------------------------------------------------------------------------------
do $$ begin
  create type public.org_kind as enum ('personal', 'circle', 'office');
exception when duplicate_object then null; end $$;

alter table public.organizations
  add column if not exists kind public.org_kind not null default 'personal';

-- Backfill any pre-existing rows just in case.
update public.organizations set kind = 'personal' where kind is null;

------------------------------------------------------------------------------
-- Invites
------------------------------------------------------------------------------
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.role not null default 'household',
  -- 32-char hex token. Uses the built-in gen_random_uuid (Postgres 13+) so
  -- we don't depend on pgcrypto being on the search_path during migration apply.
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);

create index if not exists invites_org_idx on public.invites(organization_id);
create index if not exists invites_email_idx on public.invites(email);
create index if not exists invites_token_idx on public.invites(token);

------------------------------------------------------------------------------
-- RLS on invites
-- Owners of the org can manage invites. Accept flow will be added later via
-- a SECURITY DEFINER function so non-members can redeem by token.
------------------------------------------------------------------------------
alter table public.invites enable row level security;

drop policy if exists "invites_read_owner" on public.invites;
create policy "invites_read_owner"
  on public.invites for select
  using (public.org_role(organization_id) = 'owner');

drop policy if exists "invites_insert_owner" on public.invites;
create policy "invites_insert_owner"
  on public.invites for insert
  to authenticated
  with check (
    public.org_role(organization_id) = 'owner'
    and (created_by is null or created_by = auth.uid())
  );

drop policy if exists "invites_update_owner" on public.invites;
create policy "invites_update_owner"
  on public.invites for update
  using (public.org_role(organization_id) = 'owner')
  with check (public.org_role(organization_id) = 'owner');

drop policy if exists "invites_delete_owner" on public.invites;
create policy "invites_delete_owner"
  on public.invites for delete
  using (public.org_role(organization_id) = 'owner');
