-- 0024_document_chunks.sql
-- Semantic search foundation for Oria's multi-stage ingestion pipeline.
--
-- Adds:
--   1. pgvector extension (384-dim MiniLM-L6-v2 embeddings)
--   2. document_chunks — one row per text chunk with its embedding
--   3. uploads columns — extraction_method, chunk_count, is_chunked, file_hash
--   4. HNSW index for fast approximate nearest-neighbour search
--   5. match_document_chunks() RPC for hybrid keyword + vector search
--
-- Idempotent. Safe to re-run.

------------------------------------------------------------------------------
-- 1. pgvector extension
------------------------------------------------------------------------------
create extension if not exists vector;

------------------------------------------------------------------------------
-- 2. New columns on uploads
--    extraction_method — which tool produced the text
--    chunk_count       — how many chunks were stored for this upload
--    is_chunked        — true once chunks exist in document_chunks
--    file_hash         — SHA-256 of the raw file bytes (for deduplication)
------------------------------------------------------------------------------
alter table public.uploads
  add column if not exists extraction_method text,
  add column if not exists chunk_count       integer not null default 0,
  add column if not exists is_chunked        boolean not null default false,
  add column if not exists file_hash         text;

-- Index for deduplication lookups (same org, same file)
create index if not exists uploads_file_hash_org_idx
  on public.uploads(organization_id, file_hash)
  where file_hash is not null;

------------------------------------------------------------------------------
-- 3. document_chunks
--    Stores paragraph/sentence-level chunks with 384-dim embeddings.
--    chunk_index is 0-based position within the source upload.
------------------------------------------------------------------------------
create table if not exists public.document_chunks (
  id             uuid    primary key default gen_random_uuid(),
  upload_id      uuid    not null references public.uploads(id) on delete cascade,
  organization_id uuid   not null references public.organizations(id) on delete cascade,
  chunk_index    integer not null,
  content        text    not null,
  embedding      vector(384),                 -- MiniLM-L6-v2
  token_count    integer,
  metadata       jsonb   not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (upload_id, chunk_index)
);

-- Standard list queries
create index if not exists chunks_upload_idx
  on public.document_chunks(upload_id, chunk_index);

create index if not exists chunks_org_idx
  on public.document_chunks(organization_id, created_at desc);

------------------------------------------------------------------------------
-- 4. HNSW index for approximate nearest-neighbour search (cosine distance)
--    ef_construction=128, m=16 — good balance of recall vs build time.
--    Only covers rows that have an embedding (skips nulls automatically).
------------------------------------------------------------------------------
create index if not exists chunks_embedding_hnsw_idx
  on public.document_chunks
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 128);

------------------------------------------------------------------------------
-- 5. match_document_chunks — RPC for semantic search
--    Called from lib/embedding/search.ts.
--    Returns chunks ordered by cosine similarity, filtered by org and
--    optionally by section (stored in chunk metadata).
--
--    Parameters:
--      query_embedding  — 384-dim query vector
--      match_org_id     — organisation scope
--      match_count      — max rows to return (default 10)
--      similarity_threshold — minimum cosine similarity 0..1 (default 0.3)
--      filter_section   — optional section name to narrow results
------------------------------------------------------------------------------
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
  where
    dc.organization_id = match_org_id
    and dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) >= similarity_threshold
    and (
      filter_section is null
      or dc.metadata ->> 'section' = filter_section
    )
  order by dc.embedding <=> query_embedding
  limit match_count;
end;
$$;

------------------------------------------------------------------------------
-- 6. RLS for document_chunks
--    Members of the owning org can read; only the server (service_role) writes.
------------------------------------------------------------------------------
alter table public.document_chunks enable row level security;

drop policy if exists "chunks_read_members" on public.document_chunks;
create policy "chunks_read_members"
  on public.document_chunks for select
  using (public.is_org_member(organization_id));

-- Writes are done via service_role from the Next.js API route, so no
-- INSERT/UPDATE policy is needed for the anon/authenticated roles.

notify pgrst, 'reload schema';
