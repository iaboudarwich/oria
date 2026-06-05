"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext, listUserSpaces } from "./organizations";
import { logAuditEvent } from "./audit-log";
import { canRescope, ORG_SCOPED_ITEM_TABLES } from "@/lib/circles/scope";

/**
 * Move one item between PRIVATE (the owner's personal space) and exactly one
 * circle, by re-homing its organization_id. The user must currently belong to
 * the item's org AND to the target (canRescope), so an item can never be pushed
 * into a circle the user is not in, and the move is checked explicitly here on
 * the service-role path (not just trusted to RLS). Audited (item.scope_changed).
 * The DB RLS still owns who can READ the item afterward, by membership.
 */
export async function setItemScope(input: {
  table: string;
  id: string;
  targetOrgId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireContext();
  const table = input.table;
  if (!(ORG_SCOPED_ITEM_TABLES as readonly string[]).includes(table)) {
    return { ok: false, error: "bad_table" };
  }
  if (!input.id || !input.targetOrgId) return { ok: false, error: "bad_request" };

  const spaces = await listUserSpaces();
  const myOrgIds = spaces.map((s) => s.organization.id);
  if (!canRescope({ viewerOrgIds: myOrgIds, targetOrgId: input.targetOrgId })) {
    return { ok: false, error: "not_a_member" };
  }

  const admin = createAdminClient();
  // Read the item's current org and confirm the user is a member of it.
  const { data: row } = await admin
    .from(table)
    .select("organization_id")
    .eq("id", input.id)
    .maybeSingle();
  const fromOrg = (row as { organization_id?: string } | null)?.organization_id ?? null;
  if (!fromOrg || !myOrgIds.includes(fromOrg)) return { ok: false, error: "not_found" };
  if (fromOrg === input.targetOrgId) return { ok: true };

  const { error } = await admin
    .from(table)
    .update({ organization_id: input.targetOrgId })
    .eq("id", input.id)
    .eq("organization_id", fromOrg);
  if (error) return { ok: false, error: "failed" };

  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: input.targetOrgId,
    action: "item.scope_changed",
    resourceType: table,
    resourceId: input.id,
    metadata: { from_org: fromOrg, to_org: input.targetOrgId },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/trackables");
  return { ok: true };
}
