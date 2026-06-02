"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContext, listUserSpaces } from "@/lib/data/organizations";
import { generateReshapePlan } from "@/lib/onboarding/template-generator";
import { executeSetupPlan } from "@/lib/onboarding/plan-executor";
import { logAuditEvent } from "@/lib/data/audit-log";
import type { SetupPlan, UserContext } from "@/lib/onboarding/types";

/** Generate the additive plan for a reshape request. */
export async function reshapeGeneratePlan(
  userContext: UserContext,
  intent: string,
): Promise<SetupPlan> {
  const ctx = await getCurrentContext();
  if (!ctx) return { spaces: [] };
  const locale = await getLocale();
  const spaces = await listUserSpaces();
  const existing = spaces.map((s) => s.organization.name);
  // Fold the conversation's notes into the intent so the generator has both.
  const fullIntent = [intent, userContext.notes].filter(Boolean).join(". ");
  return generateReshapePlan(fullIntent, userContext.notes, existing, locale);
}

/** Execute a reshape plan (additive). Recorded with source 'reconfigure'. */
export async function reshapeExecute(plan: SetupPlan): Promise<{ ok: boolean }> {
  const ctx = await getCurrentContext();
  if (!ctx) return { ok: false };
  const result = await executeSetupPlan({ userId: ctx.profile.id, plan, source: "reconfigure" });
  if (result.ok) revalidatePath("/dashboard", "layout");
  return { ok: result.ok };
}

type StoredPlan = SetupPlan & { created_org_ids?: string[] };

/**
 * Undo a setup change within 24h: remove the orgs it created. If any created
 * org already holds uploads, require an explicit force (the UI asks again).
 */
export async function undoSetupChange(
  planId: string,
  force = false,
): Promise<{ ok: boolean; needsConfirm?: boolean }> {
  const ctx = await getCurrentContext();
  if (!ctx) return { ok: false };
  const admin = createAdminClient();

  const { data } = await admin
    .from("onboarding_setup_plans")
    .select("id, plan, executed_at, reverted_at")
    .eq("id", planId)
    .eq("user_id", ctx.profile.id)
    .maybeSingle();
  const row = data as
    | { id: string; plan: StoredPlan; executed_at: string; reverted_at: string | null }
    | null;
  if (!row || row.reverted_at) return { ok: false };
  if (Date.now() - new Date(row.executed_at).getTime() >= 24 * 60 * 60 * 1000) return { ok: false };

  const orgIds = (row.plan?.created_org_ids ?? []).filter(Boolean);
  if (orgIds.length === 0) return { ok: false };

  if (!force) {
    const { count } = await admin
      .from("uploads")
      .select("id", { count: "exact", head: true })
      .in("organization_id", orgIds);
    if ((count ?? 0) > 0) return { ok: false, needsConfirm: true };
  }

  for (const id of orgIds) {
    await admin.from("organizations").delete().eq("id", id).eq("created_by", ctx.profile.id);
  }
  await admin
    .from("onboarding_setup_plans")
    .update({ reverted_at: new Date().toISOString() })
    .eq("id", planId);

  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "setup_change_reverted",
    resourceType: "setup_plan",
    resourceId: planId,
    metadata: { orgs_removed: orgIds.length },
  });
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
