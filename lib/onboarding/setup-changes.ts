import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { SetupPlan } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SetupChange = {
  id: string;
  summary: string;
  source: string;
  executedAt: string;
  reverted: boolean;
  undoable: boolean;
};

type StoredPlan = SetupPlan & { created_org_ids?: string[] };

function summarize(plan: StoredPlan): string {
  const workspaces = (plan.spaces ?? []).flatMap((s) => s.workspaces.map((w) => w.name));
  if (workspaces.length === 0) return "Setup change";
  if (workspaces.length === 1) return workspaces[0];
  return `${workspaces[0]} and ${workspaces.length - 1} more`;
}

/** Last 14 days of setup actions, newest first, each flagged undoable within 24h. */
export async function listRecentSetupChanges(userId: string): Promise<SetupChange[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 14 * DAY_MS).toISOString();
  const { data } = await admin
    .from("onboarding_setup_plans")
    .select("id, plan, source, executed_at, reverted_at")
    .eq("user_id", userId)
    .gte("executed_at", since)
    .order("executed_at", { ascending: false });
  const rows =
    (data as
      | { id: string; plan: StoredPlan; source: string; executed_at: string; reverted_at: string | null }[]
      | null) ?? [];
  return rows.map((r) => ({
    id: r.id,
    summary: summarize(r.plan ?? { spaces: [] }),
    source: r.source,
    executedAt: r.executed_at,
    reverted: !!r.reverted_at,
    undoable:
      !r.reverted_at &&
      Date.now() - new Date(r.executed_at).getTime() < DAY_MS &&
      ((r.plan?.created_org_ids?.length ?? 0) > 0),
  }));
}
