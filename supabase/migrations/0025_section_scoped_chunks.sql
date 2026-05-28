-- 0025_section_scoped_chunks.sql
-- Security fix: match_document_chunks() now respects upload visibility rules.
--
-- Root cause: the previous implementation was SECURITY DEFINER and only
-- filtered by organization_id. A member with 'limited' access could call this
-- RPC and receive chunks from sections they were never granted access to,
-- bypassing the uploads_read_v2 RLS policy entirely.
--
-- Fix: JOIN document_chunks → uploads and apply the same visibility predicate
-- as uploads_read_v2 (migration 0012_access_levels.sql). The function keeps
-- an identical signature — no callers need to change.
--
-- Predicate summary:
--   1. Uploader always sees their own uploads.
--   2. owner / full members see all non-private uploads in the org.
--   3. limited members see circle uploads in their allowed sections
--      + specific uploads explicitly shared with them.
--   4. assigned members see only specific uploads shared with them.
--
-- Idempotent via CREATE OR REPLACE.

create or replace function public.match_document_chunks(
  query_embedding      vector(384),
  match_org_id         uuid,
  match_count          int     default 10,
  similarity_threshold float   default 0.3,
  filter_section       text    default null
)
returns table (
  id              uuid,
  upload_id       uuid,
  chunk_index     integer,
  content         text,
  metadata        jsonb,
  similarity      float
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  return query
  select
    dc.id,
    dc.upload_id,
    dc.chunk_index,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  join public.uploads u on u.id = dc.upload_id
  where
    dc.organization_id = match_org_id
    and dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) >= similarity_threshold
    and (
      filter_section is null
      or dc.metadata ->> 'section' = filter_section
    )
    -- ── Visibility predicate (mirrors uploads_read_v2) ────────────────────
    and (
      -- Uploader always sees their own uploads.
      u.uploaded_by = _uid
      or (
        public.is_org_member(match_org_id)
        and u.visibility <> 'private'
        and (
          -- owner / full: see all non-private uploads in the org.
          public.my_access_level(match_org_id) in ('owner', 'full')
          or (
            -- limited: circle uploads in allowed sections +
            --          specific uploads shared directly.
            public.my_access_level(match_org_id) = 'limited'
            and (
              (u.visibility = 'circle'   and public.upload_in_my_sections(u.id))
              or (u.visibility = 'specific' and public.upload_shared_with_me(u.id))
            )
          )
          or (
            -- assigned: only specifically shared uploads.
            public.my_access_level(match_org_id) = 'assigned'
            and u.visibility = 'specific'
            and public.upload_shared_with_me(u.id)
          )
        )
      )
    )
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

notify pgrst, 'reload schema';
