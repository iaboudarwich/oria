import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listUserSpaces } from "./organizations";
import type {
  DocumentType,
  MemoryItem,
  Reminder,
  Section,
} from "@/lib/supabase/types";
import type {
  CalendarCategory,
  CalendarEntry,
  CalendarSpace,
  CalendarTopic,
} from "./calendar-types";

export type {
  CalendarCategory,
  CalendarEntry,
  CalendarSpace,
  CalendarTopic,
} from "./calendar-types";
export {
  CALENDAR_CATEGORY_LABEL,
  CALENDAR_TOPIC_LABEL,
} from "./calendar-types";

/**
 * Map a section onto one of our handful of human calendar categories. Sections
 * we don't surface separately (household, properties, etc.) collapse to the
 * generic "reminders" bucket so the filter row stays short and obvious.
 */
function categoryFromSection(section: Section | null): CalendarCategory {
  if (section === "finance") return "finance";
  if (section === "travel") return "travel";
  if (section === "health") return "health";
  if (section === "events") return "events";
  if (section === "personal") return "personal";
  return "reminders";
}

/**
 * Map an entry to one of the operational topic buckets the filters and
 * the "coming up" rollup hang off of. First match wins, ordered by
 * priority so a single label is always meaningful.
 */
function deriveCalendarTopic(input: {
  kind: "reminder" | "item";
  title: string;
  due_at: string;
  done: boolean | null;
  source: string | null;
  category: CalendarCategory;
  documentType: DocumentType | null;
  isRecurring: boolean | null;
  nowMs: number;
}): CalendarTopic {
  const titleLower = input.title.toLowerCase();

  // 1. Overdue overrides everything for reminders.
  if (
    input.kind === "reminder" &&
    input.done === false &&
    new Date(input.due_at).getTime() < input.nowMs
  ) {
    return "overdue";
  }

  // 2. Travel — doc_type is the strongest signal.
  if (
    input.documentType === "boarding_pass" ||
    /\bflight\b|\bboarding\b/.test(titleLower)
  ) {
    return "flight";
  }
  if (
    input.documentType === "ticket" ||
    input.documentType === "itinerary"
  ) {
    return "travel";
  }
  if (input.category === "travel") return "travel";

  // 3. Specific document types worth their own label.
  if (/\blease\b|\btenant\b|\brent\b/.test(titleLower)) return "lease";
  if (/\binsurance\b|\bpolicy\b|\bpremium\b/.test(titleLower))
    return "insurance";
  if (input.documentType === "contract") {
    if (/\brenew/.test(titleLower) || /\bexpir/.test(titleLower))
      return "renewal";
    return "contract";
  }
  if (input.documentType === "invoice" || /\binvoice\b/.test(titleLower))
    return "invoice";

  // 4. Renewals not caught above (e.g. reminders titled "X renewal due").
  if (/\brenew/.test(titleLower) || /\bexpir/.test(titleLower)) {
    return "renewal";
  }

  // 5. Recurring + payment buckets.
  if (input.isRecurring === true) return "recurring";
  if (
    /\bpay\b|\bbill\b|\bpayment\b/.test(titleLower) ||
    input.category === "finance"
  ) {
    return "payment";
  }

  // 6. Fallback by kind.
  if (input.kind === "reminder") return "reminder";
  return "event";
}

/**
 * Pull every calendar-worthy thing visible to the current user, across every
 * space they belong to. Two sources:
 *
 *   • reminders with a real due_at — tasks the user can mark done
 *   • memory_items with a real occurred_at — passive events Oria extracted
 *     from uploads (flights, hotel check-ins, payments due)
 *
 * Anything without a real date is excluded: the calendar is for things that
 * happen on a date. Vague tasks live on the upload itself, not here.
 *
 * RLS scopes per-org for both tables, so this is safe to query without an
 * org filter.
 */
export async function loadCalendar(): Promise<{
  entries: CalendarEntry[];
  spaces: CalendarSpace[];
}> {
  const userSpaces = await listUserSpaces();
  const spaces: CalendarSpace[] = userSpaces.map((s) => ({
    id: s.organization.id,
    name: s.organization.name,
    kind: s.organization.kind,
  }));

  if (spaces.length === 0) {
    return { entries: [], spaces: [] };
  }

  const supabase = await createClient();

  const orgIds = spaces.map((s) => s.id);

  // Reminders with a real due date.
  const remindersRes = await supabase
    .from("reminders")
    .select("*")
    .in("organization_id", orgIds)
    .not("due_at", "is", null)
    .order("due_at", { ascending: true })
    .limit(500);
  const reminders = (remindersRes.data ?? []) as Reminder[];

  // Memory items with a real event date.
  const itemsRes = await supabase
    .from("memory_items")
    .select(
      "id, organization_id, upload_id, title, occurred_at, section, merchant, amount_value, amount_currency, location, summary, document_type, is_recurring",
    )
    .in("organization_id", orgIds)
    .not("occurred_at", "is", null)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: true })
    .limit(500);
  type ItemRow = Pick<
    MemoryItem,
    | "id"
    | "organization_id"
    | "upload_id"
    | "title"
    | "occurred_at"
    | "section"
    | "merchant"
    | "amount_value"
    | "amount_currency"
    | "location"
    | "summary"
    | "document_type"
    | "is_recurring"
  >;
  const items = (itemsRes.data ?? []) as ItemRow[];

  // For upload-linked reminders we want both the parent's section
  // (for category colouring) and document_type (for topic precision —
  // e.g. a reminder spawned from an invoice should classify as
  // "invoice", a contract → "contract"/"renewal").
  const uploadIds = Array.from(
    new Set(
      reminders
        .map((r) => r.upload_id)
        .filter((id): id is string => !!id),
    ),
  );

  type UploadHint = {
    section: Section | null;
    document_type: DocumentType | null;
  };
  const uploadHintById = new Map<string, UploadHint>();
  if (uploadIds.length > 0) {
    const { data: uploadRows } = await supabase
      .from("uploads")
      .select("id, section, document_type")
      .in("id", uploadIds);
    for (const u of (uploadRows ?? []) as Array<{
      id: string;
      section: Section | null;
      document_type: DocumentType | null;
    }>) {
      uploadHintById.set(u.id, {
        section: u.section,
        document_type: u.document_type,
      });
    }
  }

  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  const nowMs = Date.now();

  const reminderEntries: CalendarEntry[] = [];
  for (const r of reminders) {
    const space = spaceById.get(r.organization_id);
    if (!space || !r.due_at) continue;
    const hint = r.upload_id ? uploadHintById.get(r.upload_id) : undefined;
    const section = hint?.section ?? null;
    const category = categoryFromSection(section);
    reminderEntries.push({
      id: `reminder:${r.id}`,
      kind: "reminder",
      title: r.title,
      due_at: r.due_at,
      done: r.done,
      source: r.source,
      confirmed_at: r.confirmed_at,
      upload_id: r.upload_id,
      space_id: space.id,
      space_name: space.name,
      space_kind: space.kind,
      category,
      topic: deriveCalendarTopic({
        kind: "reminder",
        title: r.title,
        due_at: r.due_at,
        done: r.done,
        source: r.source,
        category,
        documentType: hint?.document_type ?? null,
        isRecurring: null,
        nowMs,
      }),
      meta: null,
    });
  }

  const itemEntries: CalendarEntry[] = [];
  for (const it of items) {
    const space = spaceById.get(it.organization_id);
    if (!space || !it.occurred_at) continue;
    const amountDisplay = it.amount_value
      ? it.amount_currency
        ? `${it.amount_value} ${it.amount_currency}`
        : it.amount_value
      : null;
    const category = categoryFromSection(it.section);
    itemEntries.push({
      id: `item:${it.id}`,
      kind: "item",
      title: it.title,
      due_at: it.occurred_at,
      done: null,
      source: null,
      confirmed_at: null,
      upload_id: it.upload_id,
      space_id: space.id,
      space_name: space.name,
      space_kind: space.kind,
      category,
      topic: deriveCalendarTopic({
        kind: "item",
        title: it.title,
        due_at: it.occurred_at,
        done: null,
        source: null,
        category,
        documentType: it.document_type ?? null,
        isRecurring: it.is_recurring ?? null,
        nowMs,
      }),
      meta: {
        merchant: it.merchant,
        amount_display: amountDisplay,
        location: it.location,
      },
    });
  }

  const entries = [...reminderEntries, ...itemEntries].sort(
    (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
  );

  return { entries, spaces };
}

/**
 * "Coming up" summary buckets used by the calendar rollup card. We do
 * the date math here in a server-only module so React's purity rule
 * doesn't trip on calling Date.now() inside a server component.
 */
export type ComingUpBucket = {
  key: "overdue" | "this-week" | "renewals" | "travel" | "recurring";
  label: string;
  count: number;
  next: CalendarEntry | null;
  tone: "alert" | "neutral";
};

export function groupComingUp(entries: CalendarEntry[]): ComingUpBucket[] {
  const nowMs = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();
  const endOfWeekMs = startOfTodayMs + 7 * 24 * 60 * 60 * 1000;
  const in30dMs = nowMs + 30 * 24 * 60 * 60 * 1000;

  const overdue: CalendarEntry[] = [];
  const thisWeek: CalendarEntry[] = [];
  const renewals30d: CalendarEntry[] = [];
  const travelUpcoming: CalendarEntry[] = [];
  const recurring: CalendarEntry[] = [];

  for (const e of entries) {
    const dueMs = new Date(e.due_at).getTime();
    if (Number.isNaN(dueMs)) continue;

    if (e.topic === "overdue") {
      overdue.push(e);
      continue;
    }
    if (dueMs >= startOfTodayMs && dueMs <= endOfWeekMs) thisWeek.push(e);
    if (
      dueMs >= nowMs &&
      dueMs <= in30dMs &&
      (e.topic === "renewal" || e.topic === "lease" || e.topic === "insurance")
    ) {
      renewals30d.push(e);
    }
    if (dueMs >= nowMs && (e.topic === "flight" || e.topic === "travel")) {
      travelUpcoming.push(e);
    }
    if (e.topic === "recurring") recurring.push(e);
  }

  const byDateAsc = (a: CalendarEntry, b: CalendarEntry) =>
    new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  overdue.sort(byDateAsc);
  thisWeek.sort(byDateAsc);
  renewals30d.sort(byDateAsc);
  travelUpcoming.sort(byDateAsc);
  recurring.sort(byDateAsc);

  const buckets: ComingUpBucket[] = [
    {
      key: "overdue",
      label: "Overdue",
      count: overdue.length,
      next: overdue[0] ?? null,
      tone: "alert",
    },
    {
      key: "this-week",
      label: "This week",
      count: thisWeek.length,
      next: thisWeek[0] ?? null,
      tone: "neutral",
    },
    {
      key: "renewals",
      label: "Renewals 30d",
      count: renewals30d.length,
      next: renewals30d[0] ?? null,
      tone: "neutral",
    },
    {
      key: "travel",
      label: "Travel",
      count: travelUpcoming.length,
      next: travelUpcoming[0] ?? null,
      tone: "neutral",
    },
    {
      key: "recurring",
      label: "Recurring",
      count: recurring.length,
      next: recurring[0] ?? null,
      tone: "neutral",
    },
  ];

  return buckets.filter((b) => b.count > 0);
}
