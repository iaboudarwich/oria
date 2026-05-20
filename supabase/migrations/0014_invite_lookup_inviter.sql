-- Oria: include the inviter's display name in invite previews so the
-- landing page can say "{Inviter} invited you to join {Circle}".
--
-- Idempotent. Safe to re-run.
--
-- We `drop ... cascade` first because `create or replace function` can't
-- change a function's return signature (we're adding a column).

drop function if exists public.lookup_invite(text) cascade;
drop function if exists public.lookup_invite_by_code(text) cascade;

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
  revoked_at timestamptz,
  invited_by_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.organization_id, o.name, o.description,
         i.email, i.display_name, i.title, i.access_level,
         i.expires_at, i.accepted_at, i.revoked_at,
         coalesce(p.full_name, p.email) as invited_by_name
  from public.invites i
  join public.organizations o on o.id = i.organization_id
  left join public.profiles p on p.id = i.created_by
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
  token text,
  invited_by_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.organization_id, o.name, o.description,
         i.email, i.display_name, i.title, i.access_level,
         i.expires_at, i.accepted_at, i.revoked_at, i.token,
         coalesce(p.full_name, p.email) as invited_by_name
  from public.invites i
  join public.organizations o on o.id = i.organization_id
  left join public.profiles p on p.id = i.created_by
  where upper(replace(i.code, '-', '')) = upper(replace(p_code, '-', ''))
$$;

grant execute on function public.lookup_invite(text) to anon, authenticated;
grant execute on function public.lookup_invite_by_code(text) to anon, authenticated;

notify pgrst, 'reload schema';
