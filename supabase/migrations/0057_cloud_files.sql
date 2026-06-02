-- Round 8 F2: Google Drive files linked via the Picker. Oria stores only the
-- file reference + metadata + an AI summary for retrieval, never the content
-- itself (content is fetched on demand and cached briefly, never persisted).
--
-- summary_embedding is vector(384) to match Oria's embedding model
-- (all-MiniLM-L6-v2, the same dimension as document_chunks), so linked files
-- are searchable alongside uploaded documents in Ask Oria. (The original spec
-- said 1536; that is OpenAI-shaped and would not be populatable by Oria's embed
-- service, so 384 is used.)

CREATE TABLE IF NOT EXISTS public.cloud_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.cloud_connections(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  section_key text,
  provider_file_id text NOT NULL,
  name text NOT NULL,
  mime_type text NOT NULL,
  web_view_link text,
  icon_link text,
  thumbnail_link text,
  size_bytes bigint,
  modified_time timestamptz,
  is_folder boolean NOT NULL DEFAULT false,
  content_summary text,            -- AI-generated summary for retrieval
  summary_embedding vector(384),   -- pgvector for Ask Oria retrieval
  accessible boolean NOT NULL DEFAULT true,  -- flipped false on 403/404 from Drive
  last_fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connection_id, provider_file_id)
);

CREATE INDEX IF NOT EXISTS cloud_files_user_org_idx ON public.cloud_files (user_id, organization_id);
CREATE INDEX IF NOT EXISTS cloud_files_section_idx ON public.cloud_files (organization_id, section_key);
CREATE INDEX IF NOT EXISTS cloud_files_summary_embedding_idx
  ON public.cloud_files USING hnsw (summary_embedding vector_cosine_ops);

ALTER TABLE public.cloud_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY cf_read_own ON public.cloud_files FOR SELECT USING (user_id = auth.uid());
CREATE POLICY cf_write_own ON public.cloud_files FOR ALL USING (user_id = auth.uid());
