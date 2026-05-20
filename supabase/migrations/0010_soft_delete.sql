-- Oria: soft delete for uploads.
--
-- The app never permanently deletes a file when the user clicks "Delete".
-- Instead it sets deleted_at + deleted_by and the file moves to /dashboard/trash.
-- The actual storage object and DB row are removed either when the user clicks
-- "Delete permanently" in trash, or lazily after 30 days when trash is viewed.
--
-- Idempotent. Safe to re-run.

alter table public.uploads
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid
    references public.profiles(id) on delete set null;

-- Partial index: only soft-deleted rows. Trash queries hit this; active
-- queries skip it entirely.
create index if not exists uploads_deleted_at_idx
  on public.uploads(organization_id, deleted_at)
  where deleted_at is not null;

-- Refresh PostgREST's schema cache so the new columns are visible immediately.
notify pgrst, 'reload schema';
