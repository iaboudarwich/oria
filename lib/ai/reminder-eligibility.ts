import type { DocumentType } from "@/lib/supabase/types";

// Single source of truth for "should this extracted item become a reminder?"
//
// The fix is a positive list. An item auto-creates a reminder ONLY when it maps
// to one of these reminder-eligible kinds. Everything else (meals, photos,
// notes, receipts, screenshots, business cards, ...) produces nothing.
//
// DEDUPE (the flight double-entry bug): EVENT-shaped documents (boarding pass,
// ticket, itinerary, schedule) are deliberately NOT eligible here. They already
// appear on the calendar as their own entry via memory_items.occurred_at, so a
// "suggested" reminder at the SAME time is a pure duplicate ("Suggested by Oria"
// + "by Oria" for one flight). One ingested flight = one calendar event. See
// lib/data/auto-reminders.ts.
//
// The task's taxonomy maps onto the signals we actually carry on memory_items
// (document_type, smart_section, is_recurring) as follows:
//   bill              -> smart_section "bills" OR document_type "invoice"
//   subscription      -> recurring payment, lands in smart_section "bills"
//   insurance_policy  -> payment, lands in smart_section "bills"
//   receipt_recurring -> document_type "receipt" AND is_recurring
//   trackable_renewal -> handled separately by suggest-reminders (trackables)
//   flights / appointments -> NOT here: they self-surface on the calendar.

export type ReminderKind = "bill" | "receipt_recurring";

export type ReminderEligibility =
  | { eligible: true; kind: ReminderKind; leadDays: number }
  | { eligible: false; kind: null; leadDays: 0 };

const NOT_ELIGIBLE: ReminderEligibility = {
  eligible: false,
  kind: null,
  leadDays: 0,
};

export function reminderEligibilityForItem(item: {
  document_type: DocumentType | null;
  smart_section: string | null;
  is_recurring: boolean | null;
}): ReminderEligibility {
  const { document_type, smart_section, is_recurring } = item;

  // Bills, invoices, subscriptions, insurance: things you owe / pay.
  if (smart_section === "bills" || document_type === "invoice") {
    return { eligible: true, kind: "bill", leadDays: 3 };
  }

  // Recurring receipts (e.g. a standing order paid by card) are actionable;
  // a one-off receipt is just history and stays out.
  if (document_type === "receipt" && is_recurring === true) {
    return { eligible: true, kind: "receipt_recurring", leadDays: 3 };
  }

  // Event-shaped docs (boarding_pass, ticket, itinerary, schedule) self-surface
  // on the calendar via memory_items.occurred_at; a reminder would double them.
  // Meals (smart_section "diet"), photos, notes, screenshots, and any other
  // type: no reminder either. Everything not matched above produces nothing.
  return NOT_ELIGIBLE;
}
