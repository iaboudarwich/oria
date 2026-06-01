import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { DocumentType } from "@/lib/supabase/types";
import { reminderEligibilityForItem } from "@/lib/ai/reminder-eligibility";

/**
 * Smart calendar/reminder bridge.
 *
 * After extraction finishes for an upload, scan its high-confidence items
 * and create reminders for things the user will want to act on later.
 * invoice due dates, lease/contract renewals, recurring bills, future
 * insurance payments. The model has already done the reading; this
 * function just translates "this item is an action with a date" into
 * "here is a reminder."
 *
 * Rules:
 *   • Only items with confidence >= AUTO_REMINDER_CONFIDENCE.
 *   • Only items with a future occurred_at (a date in the past is history,
 *     not a reminder).
 *   • Document types that are *event* shaped (boarding pass, ticket,
 *     itinerary, schedule) already show up in the calendar via
 *     memory_items.occurred_at. we don't double them up as reminders.
 *   • Recurring items (is_recurring=true) get a one-shot reminder for the
 *     next occurrence. Building a real recurrence engine that
 *     materializes future instances is deliberately out of scope.
 *   • source="suggested" so the reminders list can show them differently
 *     from manually-created ones if it wants.
 *
 * Per-org by construction: every insert filters on organization_id, never
 * crosses spaces.
 */

const AUTO_REMINDER_CONFIDENCE = 0.7;

type ItemRow = {
  id: string;
  title: string;
  merchant: string | null;
  document_type: DocumentType | null;
  occurred_at: string | null;
  is_recurring: boolean | null;
  recurring_interval: string | null;
  confidence: number | null;
  smart_section: string | null;
  summary: string | null;
};

type Proposal = {
  organization_id: string;
  title: string;
  due_at: string;
  lead_days: number;
  upload_id: string | null;
  source: "suggested";
};

export async function proposeAutoReminders(input: {
  uploadId: string;
  organizationId: string;
}): Promise<number> {
  // Called inside Next after() (post-response), so we can't read
  // cookies. Use the admin client. Org scoping is enforced by the
  // explicit organizationId on every read/write below.
  const supabase = createAdminClient();
  const { data: itemRows, error } = await supabase
    .from("memory_items")
    .select(
      "id, title, merchant, document_type, occurred_at, is_recurring, recurring_interval, confidence, smart_section, summary",
    )
    .eq("upload_id", input.uploadId)
    .eq("organization_id", input.organizationId)
    .is("deleted_at", null);
  if (error || !itemRows || itemRows.length === 0) return 0;
  return runProposalsForItems(itemRows as ItemRow[], {
    uploadId: input.uploadId,
    organizationId: input.organizationId,
  });
}

/**
 * Same logic as proposeAutoReminders but pivots on a list of newly-
 * inserted memory_items ids. Used by the typed-text logging path
 * where items have no upload_id.
 */
export async function proposeAutoRemindersForItems(input: {
  itemIds: string[];
  organizationId: string;
}): Promise<number> {
  if (input.itemIds.length === 0) return 0;
  const supabase = createAdminClient();
  const { data: itemRows, error } = await supabase
    .from("memory_items")
    .select(
      "id, title, merchant, document_type, occurred_at, is_recurring, recurring_interval, confidence, smart_section, summary",
    )
    .in("id", input.itemIds)
    .eq("organization_id", input.organizationId)
    .is("deleted_at", null);
  if (error || !itemRows || itemRows.length === 0) return 0;
  return runProposalsForItems(itemRows as ItemRow[], {
    uploadId: null,
    organizationId: input.organizationId,
  });
}

async function runProposalsForItems(
  items: ItemRow[],
  scope: { uploadId: string | null; organizationId: string },
): Promise<number> {
  const supabase = createAdminClient();
  const nowMs = Date.now();
  const proposals: Array<Omit<Proposal, "upload_id"> & { upload_id: string | null }> = [];

  for (const it of items) {
    if ((it.confidence ?? 0) < AUTO_REMINDER_CONFIDENCE) continue;
    if (!it.occurred_at) continue;
    const dueMs = new Date(it.occurred_at).getTime();
    if (Number.isNaN(dueMs)) continue;
    if (dueMs <= nowMs) continue; // already happened

    // Positive-list gate: only reminder-eligible kinds auto-create. Meals,
    // photos, notes, and one-off receipts produce nothing. See
    // reminder-eligibility.ts for the full mapping.
    const eligibility = reminderEligibilityForItem({
      document_type: it.document_type,
      smart_section: it.smart_section,
      is_recurring: it.is_recurring,
    });
    if (!eligibility.eligible) continue;

    proposals.push({
      organization_id: scope.organizationId,
      title: composeTitle(it, {
        isBill: eligibility.kind === "bill",
        isRecurring: it.is_recurring === true,
      }),
      due_at: it.occurred_at,
      lead_days: eligibility.leadDays,
      upload_id: scope.uploadId,
      source: "suggested",
    });
  }

  if (proposals.length === 0) return 0;
  const { error: insertError } = await supabase
    .from("reminders")
    .insert(proposals);
  if (insertError) return 0;
  return proposals.length;
}

function composeTitle(
  item: ItemRow,
  flags: { isBill: boolean; isRecurring: boolean },
): string {
  const who = item.merchant?.trim();
  if (item.document_type === "invoice" || flags.isBill) {
    return who ? `Pay ${who}` : `Pay ${item.title}`;
  }
  if (item.document_type === "contract") {
    return who ? `${who} renewal due` : `${item.title} renewal due`;
  }
  if (flags.isRecurring) {
    const base = who ?? item.title;
    return item.recurring_interval
      ? `${base} (${item.recurring_interval.toLowerCase()})`
      : `${base} (recurring)`;
  }
  return item.title;
}
