-- F3: user self-awareness infrastructure. Explicit preferences + a stream of
-- behavior signals that derive an implicit profile. Both are per-user and
-- RLS-locked to the owner.

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  response_length text DEFAULT 'medium' CHECK (response_length IN ('short', 'medium', 'long')),
  formality text DEFAULT 'casual' CHECK (formality IN ('casual', 'professional')),
  focus_areas jsonb NOT NULL DEFAULT '[]',
  pinned_metrics jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.behavior_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  signal_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.behavior_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY pref_read_own ON public.user_preferences FOR SELECT USING (user_id = auth.uid());
CREATE POLICY pref_write_own ON public.user_preferences FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY pref_insert_own ON public.user_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY behavior_read_own ON public.behavior_signals FOR SELECT USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS behavior_user_idx ON public.behavior_signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS behavior_type_idx ON public.behavior_signals(user_id, signal_type, created_at DESC);
