-- Round 12 F1: soft-delete for spaces/workspaces/circles (organizations) and
-- custom sections. The reshape engine's DELETE patch sets deleted_at; the 24h
-- purge cron hard-deletes afterward (children cascade via existing FKs).
--
-- Note: migration 0010 only added deleted_at to `uploads`, NOT to
-- custom_sections, so BOTH organizations and custom_sections need the column
-- added here. Idempotent (IF NOT EXISTS), safe to re-run.

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.custom_sections ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS organizations_deleted_at_idx
  ON public.organizations (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS custom_sections_deleted_at_idx
  ON public.custom_sections (deleted_at) WHERE deleted_at IS NOT NULL;

-- Refresh PostgREST's schema cache so the new columns are visible immediately.
notify pgrst, 'reload schema';
