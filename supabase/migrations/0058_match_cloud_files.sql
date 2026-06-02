-- Round 8 F3: semantic search over linked Drive files for Ask Oria. Mirrors
-- match_document_chunks but over cloud_files.summary_embedding. cloud_files is
-- own-row only (user_id = auth.uid()), so the visibility predicate is just the
-- owner check plus the active-org scope. Only accessible, embedded files match.
--
-- Idempotent via CREATE OR REPLACE.

create or replace function public.match_cloud_files(
  query_embedding      vector(384),
  match_org_id         uuid,
  match_count          int   default 6,
  similarity_threshold float default 0.3
)
returns table (
  id                uuid,
  name              text,
  mime_type         text,
  web_view_link     text,
  content_summary   text,
  connection_id     uuid,
  provider_file_id  text,
  similarity        float
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
    cf.id,
    cf.name,
    cf.mime_type,
    cf.web_view_link,
    cf.content_summary,
    cf.connection_id,
    cf.provider_file_id,
    1 - (cf.summary_embedding <=> query_embedding) as similarity
  from public.cloud_files cf
  where
    cf.user_id = _uid
    and cf.organization_id = match_org_id
    and cf.accessible = true
    and cf.summary_embedding is not null
    and 1 - (cf.summary_embedding <=> query_embedding) >= similarity_threshold
  order by cf.summary_embedding <=> query_embedding
  limit match_count;
end;
$$;

notify pgrst, 'reload schema';
