import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { startOfDayInTz } from "@/lib/utils/tz";

/**
 * Day signals: the real, already-stored facts the daily loop reasons over.
 *
 * Every field below maps to a column that exists in the live schema (verified
 * 2026-06-03). Nothing here is invented: routines, the journal, suggestions,
 * the overcommitment check, and roll-forward all read from this one gatherer so
 * they agree on what "today" contains. Scoped to a single user + space and run
 * with the service-role client, so it is safe in a cron (no request session).
 */

export type SignalEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  isAllDay: boolean;
};

export type SignalReminder = {
  id: string;
  title: string;
  dueAt: string | null;
  uploadId: string | null;
};

export type SignalTrackable = {
  id: string;
  title: string;
  renewalDate: string;
  category: string | null;
};

export type SignalRecurring = {
  id: string;
  merchant: string | null;
  amount: number | null;
  interval: string | null;
};

export type SignalUpload = {
  id: string;
  title: string | null;
  filename: string | null;
  section: string | null;
};

export type SignalEntity = {
  uploadId: string;
  title: string | null;
  docType: string;
  /** The date-bearing field we found (label + ISO date). */
  fieldLabel: string;
  fieldDate: string;
};

export type DaySignals = {
  /** Day boundaries (UTC instants) for the user's local "today". */
  dayStart: Date;
  dayEnd: Date;
  todayEvents: SignalEvent[];
  remindersDueToday: SignalReminder[];
  remindersOverdue: SignalReminder[];
  expiringTrackables: SignalTrackable[];
  recurringBills: SignalRecurring[];
  unfiledUploads: SignalUpload[];
  stuckUploads: SignalUpload[];
  recentlyFiled: SignalUpload[];
  actionableDocuments: SignalEntity[];
  /** Extracted doc_type per upload id, used to infer a filing section. */
  docTypeByUpload: Record<string, string>;
};

const RENEWAL_HORIZON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO yyyy-mm-dd for a date-only comparison. */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Date-bearing keys we treat as "this document implies a deadline". */
const DATE_FIELD_KEYS = [
  "due_date",
  "due",
  "expiry_date",
  "expires",
  "expiration_date",
  "renewal_date",
  "deadline",
  "valid_until",
  "payment_due",
];

/**
 * Pull the day's signals for one user in one space. `now` is injected so tests
 * and cron passes can pin a moment; defaults to the real clock at call time.
 */
export async function gatherDaySignals(
  userId: string,
  organizationId: string,
  timezone: string | null,
  now: Date,
): Promise<DaySignals> {
  const admin = createAdminClient();
  const dayStart = startOfDayInTz(now, timezone);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const horizon = new Date(dayStart.getTime() + RENEWAL_HORIZON_DAYS * DAY_MS);

  const [
    eventsRes,
    remindersRes,
    trackablesRes,
    recurringRes,
    unfiledRes,
    stuckRes,
    filedRes,
    entitiesRes,
  ] = await Promise.all([
    admin
      .from("calendar_events")
      .select("id, title, starts_at, ends_at, is_all_day")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString())
      .order("starts_at", { ascending: true }),
    admin
      .from("reminders")
      .select("id, title, due_at, upload_id")
      .eq("organization_id", organizationId)
      .eq("done", false)
      .lt("due_at", dayEnd.toISOString())
      .order("due_at", { ascending: true }),
    admin
      .from("trackables")
      .select("id, title, renewal_date, category")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .not("renewal_date", "is", null)
      .gte("renewal_date", ymd(dayStart))
      .lte("renewal_date", ymd(horizon))
      .order("renewal_date", { ascending: true }),
    admin
      .from("memory_items")
      .select("id, merchant, amount_normalized, recurring_interval")
      .eq("organization_id", organizationId)
      .eq("is_recurring", true)
      .order("occurred_at", { ascending: false })
      .limit(40),
    admin
      .from("uploads")
      .select("id, title, filename, section, status")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .is("section", null)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("uploads")
      .select("id, title, filename, section")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("uploads")
      .select("id, title, filename, section")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("status", "filed")
      .gte("created_at", dayStart.toISOString())
      .lt("created_at", dayEnd.toISOString())
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("extracted_entities")
      .select("upload_id, doc_type, fields")
      .eq("organization_id", organizationId)
      .limit(60),
  ]);

  const todayEvents: SignalEvent[] = (eventsRes.data ?? []).map((e) => ({
    id: e.id as string,
    title: (e.title as string) ?? "Untitled",
    startsAt: e.starts_at as string,
    endsAt: (e.ends_at as string) ?? null,
    isAllDay: Boolean(e.is_all_day),
  }));

  const allReminders = (remindersRes.data ?? []).map((r) => ({
    id: r.id as string,
    title: (r.title as string) ?? "Reminder",
    dueAt: (r.due_at as string) ?? null,
    uploadId: (r.upload_id as string) ?? null,
  }));
  const remindersOverdue = allReminders.filter(
    (r) => r.dueAt !== null && new Date(r.dueAt) < dayStart,
  );
  const remindersDueToday = allReminders.filter(
    (r) => r.dueAt !== null && new Date(r.dueAt) >= dayStart,
  );

  const expiringTrackables: SignalTrackable[] = (trackablesRes.data ?? []).map(
    (t) => ({
      id: t.id as string,
      title: (t.title as string) ?? "Trackable",
      renewalDate: t.renewal_date as string,
      category: (t.category as string) ?? null,
    }),
  );

  const recurringBills: SignalRecurring[] = (recurringRes.data ?? []).map(
    (m) => ({
      id: m.id as string,
      merchant: (m.merchant as string) ?? null,
      amount:
        m.amount_normalized === null ? null : Number(m.amount_normalized),
      interval: (m.recurring_interval as string) ?? null,
    }),
  );

  const mapUpload = (u: Record<string, unknown>): SignalUpload => ({
    id: u.id as string,
    title: (u.title as string) ?? null,
    filename: (u.filename as string) ?? null,
    section: (u.section as string) ?? null,
  });

  const entityRows = entitiesRes.data ?? [];
  const actionableDocuments = extractActionableDocuments(
    entityRows,
    dayStart,
    horizon,
  );
  const docTypeByUpload: Record<string, string> = {};
  for (const row of entityRows) {
    if (typeof row.upload_id === "string" && typeof row.doc_type === "string") {
      docTypeByUpload[row.upload_id] = row.doc_type;
    }
  }

  return {
    dayStart,
    dayEnd,
    todayEvents,
    remindersDueToday,
    remindersOverdue,
    expiringTrackables,
    recurringBills,
    unfiledUploads: (unfiledRes.data ?? []).map(mapUpload),
    stuckUploads: (stuckRes.data ?? []).map(mapUpload),
    recentlyFiled: (filedRes.data ?? []).map(mapUpload),
    actionableDocuments,
    docTypeByUpload,
  };
}

/**
 * Find extracted documents that carry a future-ish date in a known
 * deadline field. Pure over the rows so it can be unit-tested.
 */
export function extractActionableDocuments(
  rows: Array<{ upload_id: unknown; doc_type: unknown; fields: unknown }>,
  dayStart: Date,
  horizon: Date,
): SignalEntity[] {
  const out: SignalEntity[] = [];
  for (const row of rows) {
    const fields = row.fields;
    if (!fields || typeof fields !== "object") continue;
    const f = fields as Record<string, unknown>;
    for (const key of DATE_FIELD_KEYS) {
      const raw = f[key];
      if (typeof raw !== "string") continue;
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) continue;
      // Only flag dates inside the actionable window (today .. horizon).
      if (parsed < dayStart || parsed > horizon) continue;
      out.push({
        uploadId: row.upload_id as string,
        title: typeof f.title === "string" ? f.title : null,
        docType: (row.doc_type as string) ?? "document",
        fieldLabel: key.replace(/_/g, " "),
        fieldDate: parsed.toISOString().slice(0, 10),
      });
      break; // one signal per document
    }
  }
  return out;
}
