-- Oria: track when an upload was last opened, and by whom.
-- Adds two columns on public.uploads and a SECURITY DEFINER function so any
-- member of the organization can record an open without needing UPDATE rights
-- on the row itself.

------------------------------------------------------------------------------
-- Columns
------------------------------------------------------------------------------
alter table public.uploads
  add column if not exists last_opened_at timestamptz,
  add column if not exists last_opened_by uuid references public.profiles(id) on delete set null;

create index if not exists uploads_last_opened_idx
  on public.uploads(organization_id, last_opened_at desc);

------------------------------------------------------------------------------
-- RPC: mark_upload_opened
-- Members of the upload's org can call this to bump the open timestamp.
------------------------------------------------------------------------------
create or replace function public.mark_upload_opened(p_upload_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.uploads
  set last_opened_at = now(),
      last_opened_by = auth.uid()
  where id = p_upload_id
    and public.is_org_member(organization_id);
end;
$$;

revoke all on function public.mark_upload_opened(uuid) from public;
grant execute on function public.mark_upload_opened(uuid) to authenticated;
