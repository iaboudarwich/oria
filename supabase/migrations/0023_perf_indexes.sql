-- 0023_perf_indexes.sql
-- Indexes the new scaling features need. Every query that runs on
-- every Ask Oria call, every upload, or every admin-page render gets
-- an index here so the DB does an index lookup instead of a seq scan
-- once tables grow past a few thousand rows.
--
-- Idempotent. Safe to re-run.

-- Daily per-user upload byte quota (lib/data/quotas.ts):
--   filter by uploaded_by + created_at, sum size_bytes.
create index if not exists uploads_uploader_created_idx
  on public.uploads(uploaded_by, created_at desc);

-- Lifetime per-user storage cap (lib/data/quotas.ts checkTotalUserStorage):
--   filter by uploaded_by where deleted_at IS NULL, sum size_bytes.
create index if not exists uploads_uploader_live_idx
  on public.uploads(uploaded_by)
  where deleted_at is null;

-- Per-user Ask Oria daily cap + admin top-users panel
-- (lib/data/quotas.ts checkDailyAskRequests / monthly usage,
--  lib/data/system-health.ts collectAiUsage topActors).
-- Without this we seq-scan learning_events to count 'search.queried'
-- rows per actor.
create index if not exists learning_events_actor_kind_idx
  on public.learning_events(actor_id, kind, created_at desc);

-- Stuck-job detector (lib/data/jobs.ts getJobsHealth):
--   filter status='processing' AND started_at < cutoff. The existing
--   idx_background_jobs_status orders by created_at, so this one
--   covers the started_at predicate.
create index if not exists background_jobs_processing_started_idx
  on public.background_jobs(started_at)
  where status = 'processing';

notify pgrst, 'reload schema';
