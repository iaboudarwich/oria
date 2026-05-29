-- 0038_guided_onboarding.sql
-- Guided AI onboarding conversation sessions.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_completed_guided_onboarding boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_reprompt_dismissed_until timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_reprompt_permanent_dismiss boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('first', 'improve', 'reprompt')),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  turns jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_suggestions jsonb,
  applied_suggestions jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY os_rw ON public.onboarding_sessions
  FOR ALL USING (user_id = auth.uid());
