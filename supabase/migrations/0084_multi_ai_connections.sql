-- 0084_multi_ai_connections.sql
-- Let a user connect several AI accounts at once (Claude AND ChatGPT AND
-- Gemini), each stored, with exactly one marked active. Previously a single
-- UNIQUE(user_id) capped it at one.

-- Drop the one-per-user cap (Postgres auto-named the UNIQUE(user_id)).
ALTER TABLE public.user_ai_connections DROP CONSTRAINT IF EXISTS user_ai_connections_user_id_key;

-- Which one powers Ask Oria, and an optional human label.
ALTER TABLE public.user_ai_connections ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_ai_connections ADD COLUMN IF NOT EXISTS label text;

-- Existing single connections become the active one for their user.
UPDATE public.user_ai_connections SET is_active = true WHERE is_active = false;

-- One stored key per provider per user; reconnecting a provider replaces it.
CREATE UNIQUE INDEX IF NOT EXISTS user_ai_connections_user_provider_uniq
  ON public.user_ai_connections (user_id, provider);

-- At most one active connection per user.
CREATE UNIQUE INDEX IF NOT EXISTS user_ai_connections_active_uniq
  ON public.user_ai_connections (user_id) WHERE is_active;

-- RLS is unchanged: the existing uac_read_own / uac_write_own policies already
-- scope every row to user_id = auth.uid(), which covers multiple rows per user.
