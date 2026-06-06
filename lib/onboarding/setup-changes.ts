import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanPatch, SetupPlan } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SetupChangeItem = {
  type: "create" | "rename" | "delete";
  label: string;
  /** For renames: the new name (label holds the old). */
  to?: string;
};

export type SetupChange = {
  id: string;
  items: SetupChangeItem[];
  source: string;
  executedAt: string;
  reverted: boolean;
  undoable: boolean;
};

type StoredPlan = Partial<SetupPlan> & {
  created_org_ids?: string[];
  patch?: PlanPatch;
};

function itemsFor(plan: StoredPlan): SetupChangeItem[] {
  if (plan.patch) {
    const p = plan.patch;
    return [
      ...p.creates.map((w) => ({ type: "create" as const, label: w.name })),
      ...p.section_adds.map((a) => ({ type: "create" as const, label: a.section.title })),
      ...p.renames.map((r) => ({ type: "rename" as const, label: r.from, to: r.to })),
      ...p.deletes.map((d) => ({ type: "delete" as const, label: d.name })),
    ];
  }
  // Legacy additive plan (initial onboarding): workspaces are creates.
  const workspaces = (plan.spaces ?? []).flatMap((s) => s.workspaces.map((w) => w.name));
  return workspaces.map((name) => ({ type: "create" as const, label: name }));
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
      | {
          id: string;
          plan: StoredPlan;
          source: string;
          executed_at: string;
          reverted_at: string | null;
        }[]
      | null) ?? [];
  return rows.map((r) => {
    const plan = r.plan ?? {};
    const items = itemsFor(plan);
    const hasUndoable =
      (plan.created_org_ids?.length ?? 0) > 0 ||
      (plan.patch?.renames.length ?? 0) > 0 ||
      (plan.patch?.deletes.length ?? 0) > 0;
    return {
      id: r.id,
      items,
      source: r.source,
      executedAt: r.executed_at,
      reverted: !!r.reverted_at,
      undoable:
        !r.reverted_at && Date.now() - new Date(r.executed_at).getTime() < DAY_MS && hasUndoable,
    };
  });
}
