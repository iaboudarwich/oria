-- F1: Work becomes a top-level concept (Personal vs Work) with a default
-- workspace per kind plus N additional workspaces.
--
-- parent_kind groups orgs under the two top-level areas: personal spaces
-- (kind personal/circle) live under 'personal'; work spaces (kind office)
-- live under 'work'. is_default_for_kind marks the user's primary space in
-- each area (their Personal space; their "My Work" workspace).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS parent_kind text
    CHECK (parent_kind IN ('personal', 'work')) DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS is_default_for_kind boolean NOT NULL DEFAULT false;

-- Backfill parent_kind from the existing org kind.
UPDATE public.organizations SET parent_kind = 'work'
  WHERE kind = 'office' AND parent_kind IS DISTINCT FROM 'work';
UPDATE public.organizations SET parent_kind = 'personal'
  WHERE kind IN ('personal', 'circle') AND parent_kind IS DISTINCT FROM 'personal';

-- Every personal org is its owner's default Personal space (1:1 by design).
UPDATE public.organizations SET is_default_for_kind = true
  WHERE kind = 'personal';

-- Each creator's earliest office org becomes their default Work workspace.
-- (Orgs can be shared, but ownership is single; this is the pragmatic seed.)
UPDATE public.organizations o SET is_default_for_kind = true
  WHERE o.kind = 'office'
    AND o.id = (
      SELECT o2.id
      FROM public.organizations o2
      WHERE o2.kind = 'office' AND o2.created_by = o.created_by
      ORDER BY o2.created_at ASC
      LIMIT 1
    );
