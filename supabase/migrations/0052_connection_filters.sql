-- F3: per-connection confidentiality filters + workspace routing.

ALTER TABLE public.email_connections
  ADD COLUMN IF NOT EXISTS exclude_keywords text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclude_senders text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclude_with_attachments boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS workspace_routing text NOT NULL DEFAULT 'personal'
    CHECK (workspace_routing IN ('personal', 'work', 'auto'));

-- Count of emails the filters dropped before they ever reached the classifier.
ALTER TABLE public.email_scan_jobs
  ADD COLUMN IF NOT EXISTS emails_skipped int NOT NULL DEFAULT 0;
