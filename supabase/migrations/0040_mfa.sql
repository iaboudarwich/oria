-- 0040_mfa.sql
-- TOTP two-factor authentication.
--
-- Supabase Auth's built-in MFA stores the factor itself (the TOTP
-- secret) inside auth.mfa_factors, so we don't duplicate it here.
-- What we DO own:
--   1. profiles.mfa_enrolled_at  — the timestamp when the user finished
--      enrollment. Used by the workspace-owner soft-requirement banner
--      (and any future "encourage 2FA" prompts) without forcing us to
--      cross into the auth schema on every dashboard render.
--   2. mfa_backup_codes          — 10 single-use backup codes per user,
--      stored as SHA-256 hashes (we only ever see the plaintext once,
--      at enrollment, when we show them to the user). The TOTP secret
--      lives in Supabase; backup codes are an app-level concern.
--
-- Backup codes get their own table (instead of a JSONB array on the
-- profile row) so a UPDATE ... WHERE id = $1 marks one consumed
-- atomically. Read-modify-write on a JSONB array is racy under any
-- concurrent verification.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_enrolled_at timestamptz;

CREATE TABLE IF NOT EXISTS public.mfa_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Hot lookup: "are there any unused backup codes for this user".
-- Partial index keeps it tiny — once a code is consumed it falls out.
CREATE INDEX IF NOT EXISTS mfa_backup_codes_user_unused_idx
  ON public.mfa_backup_codes(user_id)
  WHERE consumed_at IS NULL;

-- Audit / display: list a user's codes sorted by creation. Covered
-- by the user_id column on its own; no secondary index needed.

ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;

-- The user can SEE that they have N codes (consumed vs unused). We do
-- NOT expose code_hash to the client SDK; only the service-role helpers
-- (lib/auth/mfa.ts) verify against it. RLS still restricts cross-user
-- reads as defence in depth.
CREATE POLICY mfa_backup_codes_read_own
  ON public.mfa_backup_codes
  FOR SELECT
  USING (user_id = auth.uid());

-- Writes (insert at enrollment, update consumed_at on verify) go
-- through the service-role admin client, so no INSERT/UPDATE/DELETE
-- policies are needed for end users. Lock writes out from anon/auth
-- roles explicitly.
REVOKE INSERT, UPDATE, DELETE ON public.mfa_backup_codes FROM anon, authenticated;

notify pgrst, 'reload schema';
