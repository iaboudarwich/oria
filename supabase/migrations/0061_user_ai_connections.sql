-- Round 10 F2: a user's own AI provider connection (Claude / ChatGPT / Gemini).
-- One per user (UNIQUE). The API key is stored encrypted (AES-256-GCM, same key
-- and helpers as the OAuth token storage); the column holds ciphertext only.
-- Powers the conversation surfaces; infrastructure stays on Oria's backend.

CREATE TABLE IF NOT EXISTS public.user_ai_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('anthropic', 'openai', 'gemini')),
  encrypted_api_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invalid', 'rate_limited', 'out_of_credits')),
  last_validated_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.user_ai_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY uac_read_own ON public.user_ai_connections FOR SELECT USING (user_id = auth.uid());
CREATE POLICY uac_write_own ON public.user_ai_connections FOR ALL USING (user_id = auth.uid());
