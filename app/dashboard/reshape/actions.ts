"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContext, listUserSpaces } from "@/lib/data/organizations";
import { generateReshapePatch, type ExistingOrg } from "@/lib/onboarding/reshape-plan";
import { executePlanPatch } from "@/lib/onboarding/plan-executor";
import { logAuditEvent } from "@/lib/data/audit-log";
import type { PlanPatch, UserContext } from "@/lib/onboarding/types";
import { EMPTY_PATCH } from "@/lib/onboarding/types";

/** Gather the user's current orgs + their custom sections, for patch generation. */
async function gatherStructure(userId: string): Promise<ExistingOrg[]> {
  const spaces = await listUserSpaces();
  const admin = createAdminClient();
  const orgIds = spaces.map((s) => s.organization.id);
  const { data: secRows } = orgIds.length
    ? await admin
        .from("custom_sections")
        .select("id, name, organization_id")
        .in("organization_id", orgIds)
        .is("deleted_at", null)
    : { data: [] };
  const byOrg = new Map<string, { id: string; name: string }[]>();
  for (const r of (secRows as { id: string; name: string; organization_id: string }[] | null) ??
    []) {
    const list = byOrg.get(r.organization_id) ?? [];
    list.push({ id: r.id, name: r.name });
    byOrg.set(r.organization_id, list);
  }
  return spaces
    .filter((s) => s.organization.created_by === userId)
    .map((s) => ({
      id: s.organization.id,
      name: s.organization.name,
      area: s.organization.parent_kind === "work" ? "work" : "personal",
      sections: byOrg.get(s.organization.id) ?? [],
    }));
}

/** Count the items that will be archived alongside a delete target. */
async function deleteItemCount(kind: "org" | "section", id: string): Promise<number> {
  const admin = createAdminClient();
  const col = kind === "org" ? "organization_id" : "custom_section_id";
  const { count } = await admin
    .from("uploads")
    .select("id", { count: "exact", head: true })
    .eq(col, id)
    .is("deleted_at", null);
  return count ?? 0;
}

/** Generate the reshape patch for a request, with item counts on deletes. */
export async function reshapeGeneratePatch(
  userContext: UserContext,
  intent: string,
): Promise<PlanPatch> {
  const ctx = await getCurrentContext();
  if (!ctx) return EMPTY_PATCH;
  const locale = await getLocale();
  const orgs = await gatherStructure(ctx.profile.id);
  const fullIntent = [intent, userContext.notes].filter(Boolean).join(". ");
  const patch = await generateReshapePatch(fullIntent, orgs, locale);
  // Attach item counts to deletes for the preview subtitle.
  const deletes = await Promise.all(
    patch.deletes.map(async (d) => ({ ...d, itemCount: await deleteItemCount(d.kind, d.id) })),
  );
  return { ...patch, deletes };
}

/** Execute a reshape patch. Recorded with source 'reconfigure'. */
export async function reshapeExecutePatch(
  patch: PlanPatch,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentContext();
  if (!ctx) return { ok: false };
  const result = await executePlanPatch({ userId: ctx.profile.id, patch, source: "reconfigure" });
  if (result.ok) revalidatePath("/dashboard", "layout");
  return { ok: result.ok, error: result.error };
}

type StoredPlan = {
  created_org_ids?: string[];
  patch?: PlanPatch;
  spaces?: unknown;
};

/**
 * Undo a setup change within 24h. F3 extends this to revert renames and clear
 * soft-deletes; today it removes the orgs the change created. If a created org
 * already holds uploads it asks for an explicit force.
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
  const row = data as {
    id: string;
    plan: StoredPlan;
    executed_at: string;
    reverted_at: string | null;
  } | null;
  if (!row || row.reverted_at) return { ok: false };
  if (Date.now() - new Date(row.executed_at).getTime() >= 24 * 60 * 60 * 1000) return { ok: false };

  const orgIds = (row.plan?.created_org_ids ?? []).filter(Boolean);
  const patch = row.plan?.patch;

  if (orgIds.length > 0 && !force) {
    const { count } = await admin
      .from("uploads")
      .select("id", { count: "exact", head: true })
      .in("organization_id", orgIds);
    if ((count ?? 0) > 0) return { ok: false, needsConfirm: true };
  }

  // Remove created orgs.
  for (const id of orgIds) {
    await admin.from("organizations").delete().eq("id", id).eq("created_by", ctx.profile.id);
  }
  // Revert renames + clear soft-deletes (F3).
  if (patch) {
    for (const r of patch.renames ?? []) {
      const table = r.kind === "org" ? "organizations" : "custom_sections";
      await admin
        .from(table)
        .update({ name: r.from })
        .eq("id", r.id)
        .eq("created_by", ctx.profile.id);
    }
    for (const d of patch.deletes ?? []) {
      const table = d.kind === "org" ? "organizations" : "custom_sections";
      await admin
        .from(table)
        .update({ deleted_at: null })
        .eq("id", d.id)
        .eq("created_by", ctx.profile.id);
    }
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
