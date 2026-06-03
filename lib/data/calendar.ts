import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  getCurrentContext,
  isAccountOwnerInPersonal,
  listUserSpaces,
} from "./organizations";
import { recordSystemEvent } from "./system-events";
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

  // 2. Travel. doc_type is the strongest signal.
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
 * Pull calendar-worthy entries for the user. Two sources:
 *   • reminders with a real due_at
 *   • memory_items with a real occurred_at
 *
 * SCOPE (privacy-critical):
 *
 *   • Default: ACTIVE ORGANIZATION ONLY. A Workspace member never sees
 *     the owner's Personal calendar items in the Workspace context.
 *   • Cross-space mode (`crossSpace: true`): only honoured when the
 *     current user is the Personal-space OWNER and currently sitting
 *     in their Personal space. Anyone else gets the active-org-only
 *     view regardless of the flag. This matches Ask Oria's God's Eye
 *     gate and is the ONLY path that returns multi-space data.
 *
 * The `spaces` slice returned is for the cross-space toggle UI only;
 * its presence does not imply data was fetched cross-space. Entries
 * are also passed through `enforceAllowedOrgs` as a runtime safety net
 * so a bad query can never widen the blast radius.
 */
export async function loadCalendar(
  opts: { crossSpace?: boolean } = {},
): Promise<{
  entries: CalendarEntry[];
  spaces: CalendarSpace[];
  scopeMode: "active" | "cross-space";
}> {
  const ctx = await getCurrentContext();
  if (!ctx) return { entries: [], spaces: [], scopeMode: "active" };
  const userSpaces = await listUserSpaces();
  const allSpaces: CalendarSpace[] = userSpaces.map((s) => ({
    id: s.organization.id,
    name: s.organization.name,
    kind: s.organization.kind,
  }));

  // Decide effective scope. Cross-space is opt-in AND gated by
  // Personal-owner-in-Personal. exactly the same rule that gates Ask
  // Oria's God's Eye toggle.
  const allowCross =
    opts.crossSpace === true && isAccountOwnerInPersonal(ctx);
  const scopeMode: "active" | "cross-space" = allowCross
    ? "cross-space"
    : "active";

  const orgIds = allowCross
    ? allSpaces.map((s) => s.id)
    : [ctx.organization.id];
  const allowedOrgSet = new Set(orgIds);
  if (orgIds.length === 0) {
    return { entries: [], spaces: allSpaces, scopeMode };
  }

  const supabase = await createClient();
  // `spaces` exposed to the UI is still the full membership list. it
  // powers the (visible only to Personal owners) cross-space toggle.
  // Data fetched below is constrained to `orgIds`.
  const spaces = allSpaces;

  // Reminders with a real due date.
  const remindersRes = await supabase
    .from("reminders")
    .select("*")
    .in("organization_id", orgIds)
    .not("due_at", "is", null)
    .order("due_at", { ascending: true })
    .limit(500);
  const reminders = (remindersRes.data ?? []) as Reminder[];

  // Memory items with a real event date. Diet meals (smart_section='diet') are
  // log entries that happen to carry a timestamp, not intentional calendar
  // events, so they are excluded here (Round 14 F5: e.g. a pasta entry must not
  // clutter the calendar). The OR keeps every non-diet item, including the
  // common rows where smart_section is null.
  const itemsRes = await supabase
    .from("memory_items")
    .select(
      "id, organization_id, upload_id, title, occurred_at, section, smart_section, merchant, amount_value, amount_currency, location, summary, document_type, is_recurring",
    )
    .in("organization_id", orgIds)
    .not("occurred_at", "is", null)
    .is("deleted_at", null)
    .or("smart_section.is.null,smart_section.neq.diet")
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
    | "smart_section"
    | "merchant"
    | "amount_value"
    | "amount_currency"
    | "location"
    | "summary"
    | "document_type"
    | "is_recurring"
  >;
  const items = (itemsRes.data ?? []) as ItemRow[];

  // Connector calendar events (Google/Outlook), synced into calendar_events
  // (Round 14.5 F3). Same org scoping as everything else, so RLS holds.
  const eventsRes = await supabase
    .from("calendar_events")
    .select("id, organization_id, title, starts_at, location, web_view_link, category")
    .in("organization_id", orgIds)
    .not("starts_at", "is", null)
    .order("starts_at", { ascending: true })
    .limit(500);
  type EventRow = {
    id: string;
    organization_id: string;
    title: string | null;
    starts_at: string;
    location: string | null;
    web_view_link: string | null;
    category: string | null;
  };
  const calendarEvents = (eventsRes.data ?? []) as EventRow[];

  // For upload-linked reminders we want both the parent's section
  // (for category colouring) and document_type (for topic precision.
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
      sourceGroup: "reminders",
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
      sourceGroup: it.smart_section === "bills" ? "bills" : "events",
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

  const CATEGORIES = new Set(["finance", "travel", "health", "events", "personal", "reminders"]);
  const eventEntries: CalendarEntry[] = [];
  for (const ev of calendarEvents) {
    const space = spaceById.get(ev.organization_id);
    if (!space || !ev.starts_at) continue;
    const category = (ev.category && CATEGORIES.has(ev.category)
      ? ev.category
      : "events") as CalendarEntry["category"];
    eventEntries.push({
      id: `event:${ev.id}`,
      kind: "event",
      sourceGroup: "events",
      title: ev.title || "Event",
      due_at: ev.starts_at,
      done: null,
      source: null,
      confirmed_at: null,
      upload_id: null,
      space_id: space.id,
      space_name: space.name,
      space_kind: space.kind,
      category,
      topic: "event",
      meta: { merchant: null, amount_display: null, location: ev.location },
    });
  }

  const entries = [...reminderEntries, ...itemEntries, ...eventEntries].sort(
    (a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime(),
  );

  // Final safety net. If any entry slipped through with a space_id
  // outside the allowed set (shouldn't happen. both queries filter
  // by .in("organization_id", orgIds)), drop it and log a scope
  // violation. The mapping space_id ≡ organization_id is preserved
  // upstream.
  const safeEntries = entries.filter((e) => allowedOrgSet.has(e.space_id));
  if (safeEntries.length !== entries.length) {
    void recordSystemEvent({
      kind: "scope.violation",
      severity: "error",
      message: "loadCalendar dropped cross-org entries",
      context: {
        callSite: "loadCalendar",
        dropped: entries.length - safeEntries.length,
        scopeMode,
      },
      organizationId: ctx.organization.id,
    });
  }

  return { entries: safeEntries, spaces, scopeMode };
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
