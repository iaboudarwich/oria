-- F2/F3: store each executed setup plan for audit + a 24-hour undo window (F5).
-- Also add the dedicated onboarding-completion flag that gates the new flow.

CREATE TABLE IF NOT EXISTS public.onboarding_setup_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan jsonb NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz,
  source text NOT NULL CHECK (source IN ('initial_setup', 'reconfigure')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_setup_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY osp_own ON public.onboarding_setup_plans
  FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS osp_user_idx
  ON public.onboarding_setup_plans(user_id, executed_at DESC);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
