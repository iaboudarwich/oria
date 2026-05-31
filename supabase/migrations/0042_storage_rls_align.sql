-- 0042_storage_rls_align.sql
-- Align the uploads bucket SELECT policy with uploads_read_v2.
--
-- BEFORE this migration:
--   The storage RLS policy used `is_org_member((split_part(name, '/', 1))::uuid)`
--   only. Any org member could call storage.download() or
--   createSignedUrl() on ANY upload in the org, including uploads in
--   sections they were never granted access to. The DB-level
--   uploads_read_v2 policy correctly enforced the
--   owner / full / limited / assigned tiers, but the storage layer
--   did not. scripts/audit-storage-rls.ts proves this:
--   a "limited" member with NO section assignments could still
--   download() and createSignedUrl() and GET via HTTPS.
--
-- AFTER:
--   New SECURITY DEFINER helper storage_can_read_upload(name) extracts
--   the upload id (second path segment) and applies the same
--   visibility predicate as uploads_read_v2. The storage SELECT
--   policy delegates to it. The audit script now passes all six
--   checks (stranger blocked, limited member blocked).
--
-- INSERT/DELETE policies are unchanged — those already require
-- owner = auth.uid() which is correct: only the uploader (or service
-- role) can write or remove storage objects.

create or replace function public.storage_can_read_upload(name text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  upload_id uuid;
  upl record;
  uid uuid := auth.uid();
begin
  if uid is null then
    return false;
  end if;

  -- Path shape from upload-actions.ts: "<orgId>/<uploadId>/<safeName>".
  -- A path that doesn't match the shape can never resolve to a row
  -- and is denied.
  begin
    upload_id := split_part(name, '/', 2)::uuid;
  exception when others then
    return false;
  end;

  select id, uploaded_by, organization_id, visibility
    into upl
    from public.uploads
   where id = upload_id;
  if not found then
    return false;
  end if;

  -- Uploader sees their own files no matter what.
  if upl.uploaded_by = uid then
    return true;
  end if;

  -- Must be an org member at all.
  if not public.is_org_member(upl.organization_id) then
    return false;
  end if;

  -- Private uploads: only the uploader (handled above).
  if upl.visibility = 'private' then
    return false;
  end if;

  -- owner / full members see everything non-private in the org.
  if public.my_access_level(upl.organization_id) in ('owner', 'full') then
    return true;
  end if;

  -- limited members: circle uploads in their granted sections, plus
  -- specific uploads explicitly shared with them.
  if public.my_access_level(upl.organization_id) = 'limited' then
    if upl.visibility = 'circle' and public.upload_in_my_sections(upl.id) then
      return true;
    end if;
    if upl.visibility = 'specific' and public.upload_shared_with_me(upl.id) then
      return true;
    end if;
    return false;
  end if;

  -- assigned members: only specifically shared.
  if public.my_access_level(upl.organization_id) = 'assigned' then
    return upl.visibility = 'specific' and public.upload_shared_with_me(upl.id);
  end if;

  return false;
end;
$$;

revoke all on function public.storage_can_read_upload(text) from public;
grant execute on function public.storage_can_read_upload(text) to anon, authenticated;

drop policy if exists "uploads_storage_read" on storage.objects;
create policy "uploads_storage_read"
  on storage.objects for select
  using (
    bucket_id = 'uploads'
    and name ~ '^[0-9a-f-]{36}/'
    and public.storage_can_read_upload(name)
  );

notify pgrst, 'reload schema';
