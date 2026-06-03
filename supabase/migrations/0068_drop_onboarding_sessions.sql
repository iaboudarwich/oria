-- Round 14.5 F6: drop the dead onboarding_sessions table.
--
-- Verified before writing:
--   - Zero references in lib/, app/, components/ (only in its creator
--     migration 0038_guided_onboarding.sql).
--   - No inbound foreign keys (nothing references it).
--   - One RLS policy (os_rw), dropped automatically with the table.
--   - 5 stale rows of transient guided-onboarding scratch state, not durable
--     user data. The live onboarding flow uses onboarding_setup_plans (0055)
--     plus profiles flags, never this table.
--
-- Destructive (drops 5 rows). Rollback: re-create from 0038 if ever needed.

drop table if exists public.onboarding_sessions;

-- Refresh PostgREST's schema cache.
notify pgrst, 'reload schema';
