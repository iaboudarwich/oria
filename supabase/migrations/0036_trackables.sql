-- 0036_trackables.sql
-- Trackables: anything with a renewal or expiry date.

CREATE TABLE IF NOT EXISTS public.trackables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_upload_id uuid REFERENCES public.uploads(id) ON DELETE SET NULL,
  entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN (
    'insurance', 'subscription', 'lease', 'membership',
    'certification', 'id_document', 'contract', 'warranty', 'other'
  )),
  title text NOT NULL,
  vendor text,
  starts_at date,
  ends_at date,
  renewal_date date,
  cost_amount numeric,
  cost_currency text DEFAULT 'USD',
  cost_period text CHECK (cost_period IN (
    'once', 'monthly', 'quarterly', 'semi_annually', 'annually'
  )),
  summary text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

ALTER TABLE public.trackables ENABLE ROW LEVEL SECURITY;

CREATE POLICY trackables_rw ON public.trackables FOR ALL USING (
  organization_id IN (
    SELECT organization_id FROM public.memberships WHERE user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS trackables_org_renewal_idx
  ON public.trackables(organization_id, renewal_date);
CREATE INDEX IF NOT EXISTS trackables_org_category_idx
  ON public.trackables(organization_id, category);
CREATE INDEX IF NOT EXISTS trackables_entity_idx
  ON public.trackables(entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trackables_upload_idx
  ON public.trackables(source_upload_id) WHERE source_upload_id IS NOT NULL;
