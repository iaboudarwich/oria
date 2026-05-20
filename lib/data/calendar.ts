import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listUserSpaces } from "./organizations";
import type { MemoryItem, Reminder, Section } from "@/lib/supabase/types";
import type {
  CalendarCategory,
  CalendarEntry,
  CalendarSpace,
} from "./calendar-types";

export type { CalendarCategory, CalendarEntry, CalendarSpace } from "./calendar-types";
export { CALENDAR_CATEGORY_LABEL } from "./calendar-types";

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
      "id, organization_id, upload_id, title, occurred_at, section, merchant, amount_value, amount_currency, location, summary",
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
  >;
  const items = (itemsRes.data ?? []) as ItemRow[];

  // Sections for upload-linked reminders, so we can color them by category.
  const uploadIds = Array.from(
    new Set(
      reminders
        .map((r) => r.upload_id)
        .filter((id): id is string => !!id),
    ),
  );

  const sectionByUpload = new Map<string, Section | null>();
  if (uploadIds.length > 0) {
    const { data: uploadRows } = await supabase
      .from("uploads")
      .select("id, section")
      .in("id", uploadIds);
    for (const u of (uploadRows ?? []) as Array<{
      id: string;
      section: Section | null;
    }>) {
      sectionByUpload.set(u.id, u.section);
    }
  }

  const spaceById = new Map(spaces.map((s) => [s.id, s]));

  const reminderEntries: CalendarEntry[] = [];
  for (const r of reminders) {
    const space = spaceById.get(r.organization_id);
    if (!space || !r.due_at) continue;
    const section = r.upload_id
      ? sectionByUpload.get(r.upload_id) ?? null
      : null;
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
      category: categoryFromSection(section),
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
      category: categoryFromSection(it.section),
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
