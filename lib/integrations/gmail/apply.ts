import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/data/audit-log";
import { TRACKABLE_LEAD_DAYS, type TrackableCategory } from "@/lib/ai/detect-trackable";
import {
  findSectionForItem,
  routeItemToSection,
  senderDomain,
  hasLearnedVendorRule,
} from "@/lib/sections/routing";

type ItemRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  item_type: string;
  source_subject: string | null;
  source_from: string | null;
  source_date: string | null;
  extracted: {
    title?: string;
    vendor?: string | null;
    amount?: number | null;
    currency?: string | null;
    period?: string | null;
    renewal_date?: string | null;
    event_date?: string | null;
    summary?: string | null;
    appointment_type?: string | null;
  };
};

const COST_PERIODS = new Set(["once", "monthly", "quarterly", "semi_annually", "annually"]);

function trackableCategory(itemType: string): TrackableCategory | null {
  if (itemType === "subscription") return "subscription";
  if (itemType === "bill") return "other";
  return null;
}

export type ApplyResult = {
  ok: boolean;
  error?: string;
  routedTo?: string | null; // section name the item landed in
};

/**
 * Apply a pending detected item: create the trackable and/or reminder it
 * implies, route it into a section (so it appears in that section's view), mark
 * it approved, and audit. Session-independent: callers pass the acting user +
 * org, so this works from a server action AND from the background scan/sync.
 * Idempotent: a non-pending item is left untouched.
 */
export async function applyDetectedItem(input: {
  itemId: string;
  userId: string;
  orgId: string;
}): Promise<ApplyResult> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("email_detected_items")
    .select("id, user_id, organization_id, item_type, source_subject, source_from, source_date, extracted")
    .eq("id", input.itemId)
    .eq("user_id", input.userId)
    .eq("status", "pending")
    .maybeSingle();
  const item = data as ItemRow | null;
  if (!item) return { ok: false, error: "not_found" };

  const orgId = item.organization_id ?? input.orgId;
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
        created_by: input.userId,
      })
      .select("id")
      .single();
    trackableId = (tRow as { id: string } | null)?.id ?? null;

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
            created_by: input.userId,
            done: false,
          })
          .select("id")
          .single();
        reminderId = (rRow as { id: string } | null)?.id ?? null;
      }
    }
  } else if (
    (item.item_type === "flight" ||
      item.item_type === "booking" ||
      item.item_type === "appointment") &&
    ex.event_date
  ) {
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
          created_by: input.userId,
          done: false,
        })
        .select("id")
        .single();
      reminderId = (rRow as { id: string } | null)?.id ?? null;
    }
  }

  // Route into a section so it appears in that section's view.
  const target = await findSectionForItem({
    itemType: item.item_type,
    appointmentType: ex.appointment_type ?? null,
    orgId,
    userId: input.userId,
    vendor: ex.vendor ?? null,
    senderDomain: senderDomain(item.source_from),
    keywordText: `${ex.title ?? ""} ${item.source_subject ?? ""}`,
  });
  if (target) {
    await routeItemToSection({
      orgId,
      target,
      detectedItemId: item.id,
      title,
      vendor: ex.vendor ?? null,
      amount: ex.amount ?? null,
      currency: ex.currency ?? null,
      occurredAt: ex.event_date ?? ex.renewal_date ?? item.source_date,
      summary: ex.summary ?? null,
    });
  }

  await admin
    .from("email_detected_items")
    .update({
      status: "approved",
      resulting_trackable_id: trackableId,
      resulting_reminder_id: reminderId,
      routed_section: target?.kind === "builtin" ? target.section : null,
      routed_custom_section_id: target?.kind === "custom" ? target.customSectionId : null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .eq("user_id", input.userId);

  await logAuditEvent({
    userId: input.userId,
    organizationId: orgId,
    action: "email.item_approved",
    resourceType: "email_detected_item",
    resourceId: item.id,
    metadata: {
      source: "gmail",
      item_type: item.item_type,
      trackable_id: trackableId,
      reminder_id: reminderId,
      routed_to: target?.name ?? null,
    },
  });

  return { ok: true, routedTo: target?.name ?? null };
}

const AUTO_ROUTE_CONFIDENCE = 0.75;

/**
 * After a scan, auto-apply pending items per the user's routing preference:
 *  - always_review: nothing (default behaviour stays manual)
 *  - auto_confident: apply items with confidence >= 0.75 that have a known section
 *  - auto_all: apply every pending item (routing where a section is known)
 * Returns the number of items auto-applied.
 */
export async function autoRoutePendingItems(
  userId: string,
  connectionId: string,
): Promise<number> {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("auto_route_preference")
    .eq("id", userId)
    .maybeSingle();
  const pref = (profile as { auto_route_preference?: string } | null)?.auto_route_preference ?? "auto_confident";
  if (pref === "always_review") return 0;

  // Only this connection's pending items, so each inbox auto-routes its own.
  const { data: rows } = await admin
    .from("email_detected_items")
    .select("id, item_type, confidence, extracted, source_from, organization_id")
    .eq("user_id", userId)
    .eq("connection_id", connectionId)
    .eq("status", "pending");
  const items = (rows as
    | {
        id: string;
        item_type: string;
        confidence: number | null;
        extracted: { appointment_type?: string | null; vendor?: string | null; title?: string | null };
        source_from: string | null;
        organization_id: string | null;
      }[]
    | null) ?? [];

  let applied = 0;
  for (const it of items) {
    const orgId = it.organization_id;
    if (!orgId) continue;
    const ex = it.extracted ?? {};
    if (pref === "auto_confident") {
      // A user-confirmed vendor rule is a strong signal: auto-route even if the
      // classifier confidence is below the usual bar.
      const learned = await hasLearnedVendorRule(userId, orgId, ex.vendor ?? null);
      if (!learned && (it.confidence ?? 0) < AUTO_ROUTE_CONFIDENCE) continue;
      const target = await findSectionForItem({
        itemType: it.item_type,
        appointmentType: ex.appointment_type ?? null,
        orgId,
        userId,
        vendor: ex.vendor ?? null,
        senderDomain: senderDomain(it.source_from),
        keywordText: ex.title ?? null,
      });
      if (!target) continue; // confident but no home -> leave for review
    }
    const r = await applyDetectedItem({ itemId: it.id, userId, orgId });
    if (r.ok) applied += 1;
  }
  return applied;
}
