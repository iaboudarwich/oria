-- F1: Gmail integration. One encrypted connection per (user, provider, email).
-- Tokens are stored encrypted (AES-256-GCM, separate key); the columns hold
-- ciphertext only, never plaintext.

CREATE TABLE IF NOT EXISTS public.email_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gmail' CHECK (provider IN ('gmail')),
  email_address text NOT NULL,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'revoked', 'error')),
  last_error text,
  UNIQUE (user_id, provider, email_address)
);

ALTER TABLE public.email_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY ec_read_own ON public.email_connections FOR SELECT USING (user_id = auth.uid());
CREATE POLICY ec_write_own ON public.email_connections FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS ec_user_idx ON public.email_connections(user_id, status);
