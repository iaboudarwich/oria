-- F2: Gmail scan jobs + detected items. Detected items default to pending and
-- are never auto-applied; approval (F3) creates the trackable/reminder.

CREATE TABLE IF NOT EXISTS public.email_scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.email_connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  timeframe_months int NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'canceled')),
  emails_total int DEFAULT 0,
  emails_processed int DEFAULT 0,
  items_found int DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text
);

CREATE TABLE IF NOT EXISTS public.email_detected_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_job_id uuid REFERENCES public.email_scan_jobs(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.email_connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_email_id text NOT NULL,
  source_subject text,
  source_from text,
  source_date timestamptz,
  item_type text NOT NULL CHECK (item_type IN ('subscription', 'bill', 'flight', 'booking', 'receipt', 'other')),
  extracted jsonb NOT NULL,
  confidence numeric(3,2),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'dismissed')),
  resulting_trackable_id uuid,
  resulting_reminder_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE (user_id, source_email_id, item_type)
);

ALTER TABLE public.email_scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_detected_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY esj_own ON public.email_scan_jobs FOR ALL USING (user_id = auth.uid());
CREATE POLICY edi_own ON public.email_detected_items FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS edi_user_status_idx ON public.email_detected_items(user_id, status, created_at DESC);
