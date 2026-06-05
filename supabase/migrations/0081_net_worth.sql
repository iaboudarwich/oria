-- 0081_net_worth.sql
-- Round 18 Part 1: net worth from manual holdings + daily snapshots.
--
-- Live bank linking (Plaid) is post-launch. Until then, net worth is built
-- from manually entered holdings (cash, crypto, a property value, a debt).
-- One midnight-local snapshot per owned org records the running total so the
-- net worth line has history to draw.

-- Manually entered holdings. Org-scoped, so a personal account lives in the
-- Personal space and a business account in a Work space (Round 16.8 scope).
CREATE TABLE IF NOT EXISTS public.manual_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  kind text NOT NULL CHECK (kind IN (
    'cash', 'crypto', 'investment', 'property', 'vehicle', 'other', 'debt'
  )),
  label text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  as_of date,
  notes text,
  -- When true the holding is left out of net worth + allocation insights.
  exclude_from_insights boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

ALTER TABLE public.manual_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY manual_assets_rw ON public.manual_assets FOR ALL USING (
  organization_id IN (
    SELECT organization_id FROM public.memberships WHERE user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS manual_assets_org_idx
  ON public.manual_assets(organization_id) WHERE archived_at IS NULL;

-- One snapshot row per org per local day. Written by the daily-loop cron at the
-- owner's local midnight (admin client, bypassing RLS); read by members.
CREATE TABLE IF NOT EXISTS public.net_worth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  total_assets numeric NOT NULL DEFAULT 0,
  total_liabilities numeric NOT NULL DEFAULT 0,
  net_worth numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  -- Allocation by kind for the day, e.g. {"cash": 1000, "crypto": 500}.
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, snapshot_date)
);

ALTER TABLE public.net_worth_snapshots ENABLE ROW LEVEL SECURITY;

-- Read-only to members; the cron writes through the service-role admin client.
CREATE POLICY net_worth_snapshots_read ON public.net_worth_snapshots FOR SELECT USING (
  organization_id IN (
    SELECT organization_id FROM public.memberships WHERE user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS net_worth_snapshots_org_date_idx
  ON public.net_worth_snapshots(organization_id, snapshot_date);
