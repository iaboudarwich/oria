# Storage authorization model

> Status: aligned with database RLS as of migration 0042 (2026-05-30).
> Run `npx tsx scripts/audit-storage-rls.ts --confirm` to verify.

## What's in the `uploads` bucket

Every file users upload through the app ends up at
`<organization_id>/<upload_id>/<safe_name>` inside the private
Supabase Storage bucket named `uploads`. The first two path segments
are load-bearing; the third is purely cosmetic.

The bucket is **never public**. All reads go through one of:

1. The Supabase Storage SDK with the user's session
   (`supabase.storage.from('uploads').download(path)` or
   `createSignedUrl(path)`), or
2. A signed URL the app server already minted, or
3. A direct HTTPS GET against the render endpoint with a bearer token.

All three paths hit the same `storage.objects` row-level security
predicate. There is no path that bypasses it.

## The visibility tiers we enforce

Database table `public.uploads` has had a four-tier visibility model
since migration 0012 (`uploads_read_v2` policy):

| Tier             | What the tier can see                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **uploader**     | Their own uploads, always, regardless of org settings.                                                                       |
| **owner / full** | Every non-private upload in the org.                                                                                         |
| **limited**      | Only `circle`-visibility uploads in their assigned sections, plus `specific`-visibility uploads explicitly shared with them. |
| **assigned**     | Only `specific`-visibility uploads explicitly shared with them.                                                              |

`private` uploads are visible to the uploader alone.

The storage bucket policy must enforce the **same** tiers. If the DB
policy is strict and the storage policy is permissive, a user who
knows the upload id can bypass the DB via `storage.download()`.

## How the storage policy enforces it (migration 0042)

A `SECURITY DEFINER` helper —

```sql
public.storage_can_read_upload(name text) returns boolean
```

— extracts the upload id from the path (segment 2), looks up the row
in `public.uploads`, and applies the predicate above:

1. If the caller is the uploader → allow.
2. Else if not an org member → deny.
3. Else if upload is `private` → deny (uploader-only).
4. Else if access level is `owner` or `full` → allow.
5. Else if `limited` → allow only when the upload is `circle` and in
   one of the member's assigned sections, OR `specific` and shared
   directly with them.
6. Else if `assigned` → allow only when `specific` and shared directly.

The storage `SELECT` policy delegates to that function:

```sql
create policy "uploads_storage_read"
  on storage.objects for select
  using (
    bucket_id = 'uploads'
    and name ~ '^[0-9a-f-]{36}/'
    and public.storage_can_read_upload(name)
  );
```

INSERT and DELETE policies are unchanged (and correct): both require
`owner = auth.uid()`, so only the uploader (or service role) can
write or remove an object. This matches "uploader writes + deletes
their own bytes".

## What the audit script proves

`scripts/audit-storage-rls.ts` exercises three attack vectors with
two distinct relationships:

```
[1] Stranger (not in A's org)
    ✓ SDK download() blocked
    ✓ createSignedUrl() blocked
    ✓ HTTPS GET blocked

[2] Limited member of A's org with NO section assignments
    ✓ SDK download() blocked
    ✓ createSignedUrl() blocked
    ✓ HTTPS GET blocked
```

Before migration 0042, all three checks in case [2] **failed**: a
limited member could download, sign, and HTTPS-GET any object in
their org's bucket, because the bucket policy only checked
`is_org_member`. The DB-level `uploads_read_v2` was correct; the
storage layer was the gap. After 0042 both cases are blocked.

The script cleans up unconditionally (every test user, org, upload,
and storage object is removed even on failure). It requires
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`; pass `--confirm` to run.

## What's still not covered

- **Cross-org leak via predictable IDs.** Upload ids are
  `gen_random_uuid()` (128 bits, cryptographically random). Guessing
  them is not a realistic vector. The audit script does not try.
- **Stolen session.** A compromised session has the access level the
  underlying account has. That's a different threat (see
  `auth_log` + the F4 session-management surface).
- **Bypass via service role.** The service-role key bypasses all RLS
  by design. Only the app server has it. If the env var leaks, every
  protection on this page is moot.
