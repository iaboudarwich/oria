import type { DocumentType } from "@/lib/supabase/types";

// Single source of truth for "should this extracted item become a reminder?"
//
// The bug: auto-reminders fired on too broad a set (any is_recurring item, any
// "form"), so a recurring diet meal became a reminder. Meanwhile flights, which
// are genuinely actionable, were excluded as "event docs".
//
// The fix is a positive list. An item auto-creates a reminder ONLY when it maps
// to one of these reminder-eligible kinds. Everything else (meals, photos,
// notes, receipts, screenshots, business cards, ...) produces nothing.
//
// The task's taxonomy maps onto the signals we actually carry on memory_items
// (document_type, smart_section, is_recurring) as follows:
//   bill              -> smart_section "bills" OR document_type "invoice"
//   subscription      -> recurring payment, lands in smart_section "bills"
//   insurance_policy  -> payment, lands in smart_section "bills"
//   receipt_recurring -> document_type "receipt" AND is_recurring
//   flight            -> document_type "boarding_pass" or "ticket"
//   appointment       -> document_type "schedule"
//   trackable_renewal -> handled separately by suggest-reminders (trackables)

export type ReminderKind =
  | "bill"
  | "receipt_recurring"
  | "flight"
  | "appointment";

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

  // Flights: be at the airport on time.
  if (document_type === "boarding_pass" || document_type === "ticket") {
    return { eligible: true, kind: "flight", leadDays: 1 };
  }

  // Appointments: scheduled events the user needs to show up for.
  if (document_type === "schedule") {
    return { eligible: true, kind: "appointment", leadDays: 1 };
  }

  // Meals (smart_section "diet"), photos, notes, screenshots, and any other
  // type: no reminder, no suggestion. This is the deliberate exclusion that
  // stops a diet meal from ever becoming a reminder.
  return NOT_ELIGIBLE;
}
