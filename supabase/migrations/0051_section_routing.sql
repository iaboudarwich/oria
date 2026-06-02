-- F2: auto-route detected items into sections + smart section suggestions.

-- Custom sections can opt into detected item types (e.g. a "Fitness" section
-- claiming 'subscription'). Built-in defaults live in code (lib/sections/routing).
ALTER TABLE public.custom_sections
  ADD COLUMN IF NOT EXISTS auto_route_types text[] NOT NULL DEFAULT '{}';

-- How aggressively to auto-add what Oria finds.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_route_preference text NOT NULL DEFAULT 'auto_confident'
    CHECK (auto_route_preference IN ('always_review', 'auto_confident', 'auto_all'));

-- Record where each detected item landed (null = unrouted / inbox).
ALTER TABLE public.email_detected_items
  ADD COLUMN IF NOT EXISTS routed_section text,
  ADD COLUMN IF NOT EXISTS routed_custom_section_id uuid
    REFERENCES public.custom_sections(id) ON DELETE SET NULL;

-- One pending suggestion per proposed name per org. Surfaced as a dashboard
-- banner; accepting creates the section and retroactively routes its items.
CREATE TABLE IF NOT EXISTS public.section_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  suggested_name text NOT NULL,
  item_type text,
  item_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, suggested_name)
);

ALTER TABLE public.section_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ss_own ON public.section_suggestions FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS ss_org_status_idx
  ON public.section_suggestions(organization_id, status);
