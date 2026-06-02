"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContext } from "@/lib/data/organizations";
import { logAuditEvent } from "@/lib/data/audit-log";
import { TRACKABLE_LEAD_DAYS, type TrackableCategory } from "@/lib/ai/detect-trackable";

type ItemRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  item_type: string;
  source_subject: string | null;
  extracted: {
    title?: string;
    vendor?: string | null;
    amount?: number | null;
    currency?: string | null;
    period?: string | null;
    renewal_date?: string | null;
    event_date?: string | null;
    summary?: string | null;
  };
};

const COST_PERIODS = new Set(["once", "monthly", "quarterly", "semi_annually", "annually"]);

/** Map a detected item_type to a trackables.category (or null if not a trackable). */
function trackableCategory(itemType: string): TrackableCategory | null {
  if (itemType === "subscription") return "subscription";
  if (itemType === "bill") return "other";
  return null;
}

export type ApproveResult = { ok: boolean; error?: string };

/**
 * Approve a detected item: create the trackable and/or reminder it implies,
 * then mark it approved. Subscriptions and bills become trackables (with a
 * renewal reminder when the date is in the future); flights and bookings become
 * reminders on their event date; receipts are simply acknowledged.
 * Idempotent: an already-approved item is left untouched.
 */
export async function approveDetectedItem(itemId: string): Promise<ApproveResult> {
  const ctx = await getCurrentContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  const admin = createAdminClient();

  const { data } = await admin
    .from("email_detected_items")
    .select("id, user_id, organization_id, item_type, source_subject, extracted")
    .eq("id", itemId)
    .eq("user_id", ctx.profile.id)
    .eq("status", "pending")
    .maybeSingle();
  const item = data as ItemRow | null;
  if (!item) return { ok: false, error: "not_found" };

  const orgId = item.organization_id ?? ctx.organization.id;
  const ex = item.extracted ?? {};
  const title = ex.title || item.source_subject || "Detected item";

  let trackableId: string | null = null;
  let reminderId: string | null = null;

  const category = trackableCategory(item.item_type);
  if (category) {
    const period = ex.period && COST_PERIODS.has(ex.period) ? ex.period : null;
    const { data: tRow } = await admin
      .from("trackables")
      .insert({
        organization_id: orgId,
        category,
        title,
        vendor: ex.vendor ?? null,
        renewal_date: ex.renewal_date ?? null,
        cost_amount: ex.amount ?? null,
        cost_currency: ex.currency ?? "USD",
        cost_period: period,
        summary: ex.summary ?? null,
        details: { source: "gmail", detected_item_id: item.id },
        created_by: ctx.profile.id,
      })
      .select("id")
      .single();
    trackableId = (tRow as { id: string } | null)?.id ?? null;

    // Renewal reminder when the date is in the future.
    if (ex.renewal_date) {
      const renewalMs = new Date(ex.renewal_date).getTime();
      if (!Number.isNaN(renewalMs) && renewalMs > Date.now()) {
        const leadDays = TRACKABLE_LEAD_DAYS[category] ?? 30;
        const { data: rRow } = await admin
          .from("reminders")
          .insert({
            organization_id: orgId,
            title: `${title}${ex.vendor ? ` (${ex.vendor})` : ""} renews`,
            due_at: ex.renewal_date,
            lead_days: leadDays,
            auto_suggested: true,
            created_by: ctx.profile.id,
            done: false,
          })
          .select("id")
          .single();
        reminderId = (rRow as { id: string } | null)?.id ?? null;
      }
    }
  } else if ((item.item_type === "flight" || item.item_type === "booking") && ex.event_date) {
    const eventMs = new Date(ex.event_date).getTime();
    if (!Number.isNaN(eventMs)) {
      const { data: rRow } = await admin
        .from("reminders")
        .insert({
          organization_id: orgId,
          title,
          due_at: ex.event_date,
          lead_days: 2,
          auto_suggested: true,
          created_by: ctx.profile.id,
          done: false,
        })
        .select("id")
        .single();
      reminderId = (rRow as { id: string } | null)?.id ?? null;
    }
  }

  await admin
    .from("email_detected_items")
    .update({
      status: "approved",
      resulting_trackable_id: trackableId,
      resulting_reminder_id: reminderId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .eq("user_id", ctx.profile.id);

  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: orgId,
    action: "email.item_approved",
    resourceType: "email_detected_item",
    resourceId: item.id,
    metadata: {
      source: "gmail",
      item_type: item.item_type,
      trackable_id: trackableId,
      reminder_id: reminderId,
    },
  });

  return { ok: true };
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
