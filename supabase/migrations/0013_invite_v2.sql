-- Oria: invite v2 — human invites with codes, per-person titles, section
-- allowlists, and a real accept flow.
--
-- Goals (Life360 feel, not enterprise):
--   • An owner creates an invite for one person with a friendly title.
--   • Each invite carries: a long-lived token (used in URLs) AND a short
--     human-readable code (used when typing in /join).
--   • Invites can be revoked (soft) and resent (extend expiry).
--   • Acceptance is one-time: marks the invite consumed and creates the
--     membership in a single SECURITY DEFINER call so an unmember can call it.
--   • Joining never auto-shares the joiner's personal items — personal space
--     is a separate org and stays private.
--
-- Idempotent. Safe to re-run.

------------------------------------------------------------------------------
-- 1. New columns on invites
------------------------------------------------------------------------------
alter table public.invites
  add column if not exists display_name text,
  add column if not exists title text,
  add column if not exists code text,
  add column if not exists revoked_at timestamptz;

-- Short human-readable invite code: 8 chars from an unambiguous alphabet
-- formatted XXXX-XXXX. ~852 billion possibilities; we'll let unique-violation
-- bubble up if the impossibly rare collision ever happens.
create or replace function public.gen_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
begin
  for i in 1..8 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return substr(out, 1, 4) || '-' || substr(out, 5, 4);
end
$$;

-- Backfill any existing invites that don't have a code yet.
update public.invites set code = public.gen_invite_code() where code is null;

alter table public.invites alter column code set not null;
alter table public.invites alter column code set default public.gen_invite_code();

-- Replace the (org, email) hard-unique with a partial unique: only enforce
-- against currently-active invites. Resending after revoke must work, and
-- creating a new invite for someone who already accepted must work.
alter table public.invites drop constraint if exists invites_organization_id_email_key;
drop index if exists public.invites_active_per_email;
create unique index invites_active_per_email
  on public.invites(organization_id, email)
  where accepted_at is null and revoked_at is null;

create unique index if not exists invites_code_unique on public.invites(code);
create index if not exists invites_code_idx on public.invites(code);
create index if not exists invites_active_idx
  on public.invites(organization_id, created_at desc)
  where accepted_at is null and revoked_at is null;

------------------------------------------------------------------------------
-- 2. Per-invite section allowlist (mirrors membership_sections)
--    Only meaningful for invites with access_level = 'limited'.
------------------------------------------------------------------------------
create table if not exists public.invite_sections (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invites(id) on delete cascade,
  builtin_section public.section,
  custom_section_id uuid references public.custom_sections(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (builtin_section is not null and custom_section_id is null) or
    (builtin_section is null and custom_section_id is not null)
  )
);

create unique index if not exists invite_sections_builtin_unique
  on public.invite_sections(invite_id, builtin_section)
  where builtin_section is not null;
create unique index if not exists invite_sections_custom_unique
  on public.invite_sections(invite_id, custom_section_id)
  where custom_section_id is not null;

alter table public.invite_sections enable row level security;

drop policy if exists "invite_sections_read_owner" on public.invite_sections;
create policy "invite_sections_read_owner" on public.invite_sections for select
using (
  exists (
    select 1 from public.invites i
    where i.id = invite_id
      and public.org_role(i.organization_id) = 'owner'
  )
);

drop policy if exists "invite_sections_write_owner" on public.invite_sections;
create policy "invite_sections_write_owner" on public.invite_sections for all
using (
  exists (
    select 1 from public.invites i
    where i.id = invite_id
      and public.org_role(i.organization_id) = 'owner'
  )
)
with check (
  exists (
    select 1 from public.invites i
    where i.id = invite_id
      and public.org_role(i.organization_id) = 'owner'
  )
);

------------------------------------------------------------------------------
-- 3. Public preview RPCs.
--    Called by /join pages before the user is a member, so they need
--    SECURITY DEFINER. They return ONLY the invite + circle name, nothing
--    sensitive about the org's contents.
------------------------------------------------------------------------------
create or replace function public.lookup_invite(p_token text)
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  organization_description text,
  email text,
  display_name text,
  title text,
  access_level public.access_level,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.organization_id, o.name, o.description,
         i.email, i.display_name, i.title, i.access_level,
         i.expires_at, i.accepted_at, i.revoked_at
  from public.invites i
  join public.organizations o on o.id = i.organization_id
  where i.token = p_token
$$;

create or replace function public.lookup_invite_by_code(p_code text)
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  organization_description text,
  email text,
  display_name text,
  title text,
  access_level public.access_level,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  token text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.organization_id, o.name, o.description,
         i.email, i.display_name, i.title, i.access_level,
         i.expires_at, i.accepted_at, i.revoked_at, i.token
  from public.invites i
  join public.organizations o on o.id = i.organization_id
  where upper(replace(i.code, '-', '')) = upper(replace(p_code, '-', ''))
$$;

grant execute on function public.lookup_invite(text) to anon, authenticated;
grant execute on function public.lookup_invite_by_code(text) to anon, authenticated;

------------------------------------------------------------------------------
-- 4. Accept RPC.
--    Consumes an invite for the currently signed-in user, creates the
--    membership with the recorded access_level, and (for 'limited') copies
--    the per-invite section allowlist into membership_sections.
--    Returns the joined organization id.
------------------------------------------------------------------------------
create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_invite public.invites%rowtype;
  v_membership_id uuid;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_invite from public.invites
  where token = p_token
  for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'invite_revoked' using errcode = 'P0003';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'invite_already_used' using errcode = 'P0004';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'invite_expired' using errcode = 'P0005';
  end if;

  -- Already a member? Just mark accepted, no duplicate membership.
  select id into v_membership_id from public.memberships
  where organization_id = v_invite.organization_id and user_id = v_user;

  if v_membership_id is null then
    insert into public.memberships
      (organization_id, user_id, role, access_level)
    values
      (v_invite.organization_id, v_user, v_invite.role, v_invite.access_level)
    returning id into v_membership_id;

    if v_invite.access_level = 'limited' then
      insert into public.membership_sections
        (membership_id, builtin_section, custom_section_id)
      select v_membership_id, builtin_section, custom_section_id
      from public.invite_sections
      where invite_id = v_invite.id;
    end if;
  end if;

  update public.invites
  set accepted_at = now()
  where id = v_invite.id;

  return v_invite.organization_id;
end
$$;

grant execute on function public.accept_invite(text) to authenticated;

------------------------------------------------------------------------------
-- 5. Schema cache refresh.
------------------------------------------------------------------------------
notify pgrst, 'reload schema';
