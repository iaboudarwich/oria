-- 0022_background_jobs.sql
-- Unified async-job log. Each row tracks one piece of background work
-- Oria runs after a user action: extracting an upload, generating a
-- report, creating a derived calendar item. The user-facing status
-- still lives on the entity tables (uploads.status, workspace_reports.
-- status) so existing flows keep working; this table is the parallel
-- queue that lets us see every job in one place, count retries,
-- attribute errors, and detect stuck-forever rows.
--
-- Service-role only — like system_events. Reads happen through the
-- admin client from server modules.

CREATE TABLE IF NOT EXISTS background_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id          uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- The taxonomy is intentionally short. Add a new value here when we
  -- start scheduling a new kind of background work.
  kind              text NOT NULL CHECK (kind IN (
    'upload.extract',
    'report.generate',
    'reminder.propose',
    'analysis.compute'
  )),

  status            text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'processing',
    'completed',
    'failed',
    'retrying'
  )),

  -- Optional reference to the entity this job services. Each kind
  -- populates one of these; the others stay NULL.
  upload_id         uuid REFERENCES uploads(id) ON DELETE CASCADE,
  report_id         uuid REFERENCES workspace_reports(id) ON DELETE CASCADE,
  reminder_id       uuid REFERENCES reminders(id) ON DELETE CASCADE,

  context           jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message     text,
  retry_count       integer NOT NULL DEFAULT 0,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  completed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_org_created
  ON background_jobs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_background_jobs_status
  ON background_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_background_jobs_upload
  ON background_jobs(upload_id) WHERE upload_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_background_jobs_report
  ON background_jobs(report_id) WHERE report_id IS NOT NULL;

ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
-- No public policies: service-role admin client only. Same pattern
-- as system_events.
