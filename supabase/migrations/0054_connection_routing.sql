-- F2: per-email granular routing. 'auto' keeps the smart per-item workspace
-- inference; 'fixed' sends everything from this connection to the listed orgs
-- (spaces, circles, or workspaces).

ALTER TABLE public.email_connections
  ADD COLUMN IF NOT EXISTS routing_mode text NOT NULL DEFAULT 'auto'
    CHECK (routing_mode IN ('auto', 'fixed')),
  ADD COLUMN IF NOT EXISTS routing_target_org_ids uuid[] NOT NULL DEFAULT '{}';
