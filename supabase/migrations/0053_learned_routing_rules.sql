-- F1: routing rules Oria learns from a user's corrections (with consent).
-- A row with source='user_confirmed' actively routes future matching items; a
-- row with source='suppressed' means the user declined, so we never ask again.

CREATE TABLE IF NOT EXISTS public.learned_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  match_type text NOT NULL CHECK (match_type IN ('vendor', 'sender_domain', 'item_type', 'keyword')),
  match_value text NOT NULL,
  target_section_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'user_confirmed',
  UNIQUE (user_id, organization_id, match_type, match_value)
);

ALTER TABLE public.learned_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY lrr_own ON public.learned_routing_rules
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS lrr_lookup_idx
  ON public.learned_routing_rules(user_id, organization_id, match_type, source);
