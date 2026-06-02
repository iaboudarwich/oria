-- Round 8 F1: non-mail Google services (Calendar, Drive) live in a parallel
-- connections table, keyed by (user, provider, service, account_email). Gmail
-- stays in email_connections, untouched. Tokens are stored encrypted
-- (AES-256-GCM, same key as Gmail); the columns hold ciphertext only.
--
-- A future round may consolidate email_connections + cloud_connections; do not
-- consolidate now.

CREATE TABLE IF NOT EXISTS public.cloud_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google')),  -- microsoft added later
  service text NOT NULL CHECK (service IN ('calendar', 'drive')),
  account_email text NOT NULL,
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error', 'revoked')),
  routing_mode text NOT NULL DEFAULT 'auto' CHECK (routing_mode IN ('auto', 'fixed')),
  routing_target_org_ids uuid[] NOT NULL DEFAULT '{}',
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, service, account_email)
);

ALTER TABLE public.cloud_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_read_own ON public.cloud_connections FOR SELECT USING (user_id = auth.uid());
CREATE POLICY cc_write_own ON public.cloud_connections FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS cc_user_idx ON public.cloud_connections(user_id, status);
