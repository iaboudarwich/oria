-- F2: per-space identity. Each org can override its accent (the brand color
-- used in buttons, indicators, focus rings) and shadow color (the depth/glow
-- on cards and modals). NULL means "use the template default".

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS accent_color text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shadow_color text DEFAULT NULL;
