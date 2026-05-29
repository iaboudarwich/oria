-- 0033_workspace_templates.sql
-- Adds template_key to organizations so we know which onboarding
-- template the workspace was created from.
-- NULL means "hasn't gone through template selection yet" — used to
-- redirect new users to /onboarding/template on first dashboard load.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS template_key text
    CHECK (template_key IN ('personal', 'investor', 'business', 'family_office', 'custom'));
