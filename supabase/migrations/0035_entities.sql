-- 0035_entities.sql
-- Custom entity types: user-defined schemas for tracking anything.

CREATE TABLE IF NOT EXISTS public.entity_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key text NOT NULL,
  label_singular text NOT NULL,
  label_plural text NOT NULL,
  icon text,
  -- [{key, label, type, required, options?}]
  -- types: text|number|date|currency|enum|boolean|long_text
  field_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- ["document","photo","other"] or custom
  relationship_options jsonb NOT NULL DEFAULT '["document","photo","other"]'::jsonb,
  is_seeded boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (organization_id, key)
);

CREATE TABLE IF NOT EXISTS public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type_id uuid NOT NULL REFERENCES public.entity_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  primary_photo_upload_id uuid REFERENCES public.uploads(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.entity_uploads (
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  upload_id uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'document',
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, upload_id)
);

ALTER TABLE public.entity_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY entity_types_rw ON public.entity_types FOR ALL USING (
  organization_id IN (SELECT organization_id FROM public.memberships WHERE user_id = auth.uid())
);
CREATE POLICY entities_rw ON public.entities FOR ALL USING (
  organization_id IN (SELECT organization_id FROM public.memberships WHERE user_id = auth.uid())
);
CREATE POLICY entity_uploads_rw ON public.entity_uploads FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.entities e
    WHERE e.id = entity_uploads.entity_id
      AND e.organization_id IN (SELECT organization_id FROM public.memberships WHERE user_id = auth.uid())
  )
);

CREATE INDEX IF NOT EXISTS entities_org_type_idx    ON public.entities(organization_id, entity_type_id);
CREATE INDEX IF NOT EXISTS entities_org_idx         ON public.entities(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS entity_uploads_entity_idx ON public.entity_uploads(entity_id);
CREATE INDEX IF NOT EXISTS entity_uploads_upload_idx ON public.entity_uploads(upload_id);
