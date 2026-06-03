-- Round 12 F1: soft-delete for spaces/workspaces/circles (organizations). The
-- reshape engine's DELETE patch sets deleted_at; the 24h purge cron hard-deletes
-- afterward (children cascade via existing FKs). custom_sections already carries
-- deleted_at (migration 0010), so only organizations needs the column.

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS organizations_deleted_at_idx
  ON public.organizations (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS custom_sections_deleted_at_idx
  ON public.custom_sections (deleted_at) WHERE deleted_at IS NOT NULL;
