"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContext } from "@/lib/data/organizations";
import { logAuditEvent } from "@/lib/data/audit-log";
import { applyDetectedItem } from "./apply";

export type ApproveResult = { ok: boolean; error?: string };

/**
 * Approve a detected item: create the trackable and/or reminder it implies,
 * route it into its section, then mark it approved. Thin wrapper over
 * applyDetectedItem that resolves the acting user + org from the session.
 */
export async function approveDetectedItem(itemId: string): Promise<ApproveResult> {
  const ctx = await getCurrentContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const result = await applyDetectedItem({
    itemId,
    userId: ctx.profile.id,
    orgId: ctx.organization.id,
  });
  return { ok: result.ok, error: result.error };
}

/** Dismiss a detected item without creating anything. */
export async function dismissDetectedItem(itemId: string): Promise<ApproveResult> {
  const ctx = await getCurrentContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const admin = createAdminClient();

  const { data } = await admin
    .from("email_detected_items")
    .update({ status: "dismissed", reviewed_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("user_id", ctx.profile.id)
    .eq("status", "pending")
    .select("id, item_type")
    .maybeSingle();
  if (!data) return { ok: false, error: "not_found" };

  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "email.item_dismissed",
    resourceType: "email_detected_item",
    resourceId: itemId,
    metadata: { source: "gmail", item_type: (data as { item_type: string }).item_type },
  });

  return { ok: true };
}

/** Bulk approve. Runs sequentially so each item's audit + side effects land. */
export async function approveItems(itemIds: string[]): Promise<{ approved: number }> {
  let approved = 0;
  for (const id of itemIds) {
    const r = await approveDetectedItem(id);
    if (r.ok) approved += 1;
  }
  return { approved };
}

/** Bulk dismiss. */
export async function dismissItems(itemIds: string[]): Promise<{ dismissed: number }> {
  let dismissed = 0;
  for (const id of itemIds) {
    const r = await dismissDetectedItem(id);
    if (r.ok) dismissed += 1;
  }
  return { dismissed };
}
