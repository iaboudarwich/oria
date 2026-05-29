// Plain types + labels. No server-only imports, safe from client components.

import type { OrgKind, ReminderSource } from "@/lib/supabase/types";

export type CalendarCategory =
  | "finance"
  | "travel"
  | "health"
  | "events"
  | "personal"
  | "reminders";

export const CALENDAR_CATEGORY_LABEL: Record<CalendarCategory, string> = {
  finance: "Finance",
  travel: "Travel",
  health: "Health",
  events: "Events",
  personal: "Personal",
  reminders: "Reminders",
};

/**
 * Operational classification. Categories (above) are the user-facing
 * coloured buckets; topics are the precise "what kind of thing IS this"
 * label the filters and the "coming up" rollup hang off of.
 *
 * Priority during derivation is: overdue > flight/travel > lease >
 * insurance > invoice > renewal > payment > recurring > reminder >
 * event. The first match wins so a single label is always meaningful.
 */
export type CalendarTopic =
  | "overdue"
  | "flight"
  | "travel"
  | "lease"
  | "contract"
  | "insurance"
  | "invoice"
  | "payment"
  | "renewal"
  | "recurring"
  | "reminder"
  | "event";

export const CALENDAR_TOPIC_LABEL: Record<CalendarTopic, string> = {
  overdue: "Overdue",
  flight: "Flights",
  travel: "Travel",
  lease: "Leases",
  contract: "Contracts",
  insurance: "Insurance",
  invoice: "Invoices",
  payment: "Payments",
  renewal: "Renewals",
  recurring: "Recurring",
  reminder: "Reminders",
  event: "Other",
};

export type CalendarSpace = {
  id: string;
  name: string;
  kind: OrgKind;
};

export type CalendarEntry = {
  id: string;
  /**
   * "reminder" entries come from the reminders table. they're tasks the user
   * can mark done. "item" entries come from memory_items. passive events
   * Oria extracted from uploads (flights, hotel check-ins, payments due).
   * Items are display-only; they don't have a checkbox.
   */
  kind: "reminder" | "item";
  title: string;
  /** Always non-null: the calendar excludes anything without a real date. */
  due_at: string;
  /** Only meaningful for reminder entries. Null for items. */
  done: boolean | null;
  /** Only meaningful for reminder entries. Null for items. */
  source: ReminderSource | null;
  /** Only meaningful for reminder entries. Null for items. */
  confirmed_at: string | null;
  upload_id: string | null;
  space_id: string;
  space_name: string;
  space_kind: OrgKind;
  category: CalendarCategory;
  /** Operational topic. drives the filter chips and the "coming up"
   *  rollup. See deriveCalendarTopic in lib/data/calendar.ts. */
  topic: CalendarTopic;
  /** Item-only display sugar. Null on reminders. */
  meta: {
    merchant: string | null;
    amount_display: string | null;
    location: string | null;
  } | null;
};
