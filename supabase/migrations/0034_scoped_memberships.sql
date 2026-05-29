-- 0034_scoped_memberships.sql
-- Adds can_write to membership_sections and invite_sections so limited
-- members can have per-section read vs. read+write permissions.
-- Builds on existing limited access_level + membership_sections infrastructure
-- from migration 0012.

------------------------------------------------------------------------------
-- 1. Add can_write to membership_sections (default false = read-only)
------------------------------------------------------------------------------
alter table public.membership_sections
  add column if not exists can_write boolean not null default false;

------------------------------------------------------------------------------
-- 2. Add can_write to invite_sections so the permission is stored on the
--    pending invite and copied to membership_sections on acceptance.
------------------------------------------------------------------------------
alter table public.invite_sections
  add column if not exists can_write boolean not null default false;

------------------------------------------------------------------------------
-- 3. Update accept_invite RPC to copy can_write when accepting
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
        (membership_id, builtin_section, custom_section_id, can_write)
      select v_membership_id, builtin_section, custom_section_id, can_write
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
-- 4. RLS helper: can_write_section — true if the caller has write access
--    to a specific section in an org (owner/full always yes; limited checks
--    membership_sections.can_write).
------------------------------------------------------------------------------
create or replace function public.can_write_section(p_org uuid, p_builtin text, p_custom uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_level public.access_level;
  v_member_id uuid;
begin
  select access_level, id
  into v_level, v_member_id
  from public.memberships
  where organization_id = p_org and user_id = auth.uid()
  limit 1;

  if v_level is null then return false; end if;
  if v_level in ('owner', 'full') then return true; end if;
  if v_level = 'assigned' then return false; end if;

  -- limited: check membership_sections.can_write for the section
  return exists (
    select 1 from public.membership_sections ms
    where ms.membership_id = v_member_id
      and ms.can_write = true
      and (
        (p_builtin is not null and ms.builtin_section = p_builtin::public.section)
        or (p_custom is not null and ms.custom_section_id = p_custom)
      )
  );
end;
$$;

grant execute on function public.can_write_section(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
