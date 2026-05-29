-- 0031_cross_org_search.sql
-- Adds match_document_chunks_cross_org() — same visibility predicates as
-- match_document_chunks() (0025) but spans ALL orgs the caller belongs to.
--
-- SECURITY INVOKER: RLS still applies per-row. The function broadens the
-- org filter but every visibility check (upload_in_my_sections,
-- upload_shared_with_me, my_access_level) still gates each row.
--
-- Embedding dimension: 384 (MiniLM-L6-v2), matching document_chunks.embedding.
-- Note: the spec says 1536 — this codebase uses 384-dim MiniLM embeddings.

-- Add archived_at to organizations (nullable — null means active).
alter table public.organizations
  add column if not exists archived_at timestamptz;

create or replace function public.match_document_chunks_cross_org(
  query_embedding vector(384),
  match_count     int     default 10,
  similarity_threshold float default 0.3
)
returns table (
  chunk_id        uuid,
  upload_id       uuid,
  organization_id uuid,
  content         text,
  similarity      float
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
begin
  return query
  select
    dc.id                                          as chunk_id,
    dc.upload_id,
    u.organization_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding)         as similarity
  from public.document_chunks dc
  join public.uploads u on u.id = dc.upload_id
  join public.organizations o on o.id = u.organization_id
  where
    -- Caller must be a member of the upload's org
    u.organization_id in (
      select m.organization_id
      from public.memberships m
      where m.user_id = _uid
    )
    -- Don't search archived orgs
    and o.archived_at is null
    and dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) >= similarity_threshold
    -- ── Visibility predicate (mirrors uploads_read_v2 / match_document_chunks) ──
    and (
      u.uploaded_by = _uid
      or (
        public.is_org_member(u.organization_id)
        and u.visibility <> 'private'
        and (
          public.my_access_level(u.organization_id) in ('owner', 'full')
          or (
            public.my_access_level(u.organization_id) = 'limited'
            and (
              (u.visibility = 'circle'   and public.upload_in_my_sections(u.id))
              or (u.visibility = 'specific' and public.upload_shared_with_me(u.id))
            )
          )
          or (
            public.my_access_level(u.organization_id) = 'assigned'
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
