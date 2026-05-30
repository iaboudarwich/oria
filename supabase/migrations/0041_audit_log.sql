-- 0041_audit_log.sql
-- Self-serve security audit log for the Settings → Security tab.
--
-- Distinct from system_events (which is ops-only, admin-visible,
-- cross-org, things like AI errors and stuck jobs). audit_log is
-- user-visible, scoped to the actor's own activity, and exists so
-- the user can answer "what happened on my account, from where?".
--
-- Captured at write time:
--   - actor (user_id)
--   - optional org context (organization_id)
--   - action verb (kebab snake — "auth.signin.success",
--     "upload.view", "settings.password.changed", …)
--   - optional resource pointer (resource_type + resource_id, e.g.
--     "upload"+UUID) so the UI can link back to "what was opened"
--   - request fingerprint (ip_address as inet for GeoIP lookups,
--     user_agent as raw text the UI summarises)
--   - free-form metadata (jsonb) — never PII; small structured facts

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  action text NOT NULL,
  resource_type text,
  resource_id uuid,
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Users read only their own log. Cross-user reads are impossible from
-- any non-service-role client. The service-role admin client (used by
-- logAuditEvent and by the JSON export) bypasses RLS, which is the
-- intended write path.
CREATE POLICY audit_log_read_own
  ON public.audit_log
  FOR SELECT
  USING (user_id = auth.uid());

-- Writes always go through the service-role admin client (see
-- lib/data/audit-log.ts). Lock direct writes from anon and
-- authenticated as defence in depth.
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM anon, authenticated;

-- Recent-activity feed on the Security tab queries
-- ORDER BY created_at DESC LIMIT 100 with user_id filter; this index
-- covers both.
CREATE INDEX IF NOT EXISTS audit_log_user_idx
  ON public.audit_log(user_id, created_at DESC);

-- Reverse lookup for admin debugging ("everything that happened in
-- this org in the last day"). Cheap, partial wouldn't help here.
CREATE INDEX IF NOT EXISTS audit_log_org_idx
  ON public.audit_log(organization_id, created_at DESC);

notify pgrst, 'reload schema';
