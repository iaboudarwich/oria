import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Ops-shaped event log. Distinct from `learning_events` (which captures
 * product behaviour) — this table is for platform health: failed AI
 * calls, send errors, stuck jobs. The Admin / System Health page reads
 * these to show real numbers instead of just env-var presence.
 *
 * The recorder is fire-and-forget and never throws. If logging fails
 * we'd rather the user's action complete cleanly than have telemetry
 * code break the request.
 *
 * Severity convention:
 *   • "info"  — successful AI call, successful email send, etc.
 *   • "warn"  — degraded but recoverable (extraction skipped, rate-
 *               limit retry succeeded).
 *   • "error" — outright failure with user impact.
 */

export type SystemEventSeverity = "info" | "warn" | "error";

export type SystemEventKind =
  // AI pipeline
  | "ai.request"
  | "ai.error"
  // Email
  | "email.sent"
  | "email.error"
  // Upload extraction
  | "upload.processed"
  | "upload.failed"
  | "extraction.skipped"
  | "extraction.reused"
  // Reports
  | "report.ready"
  | "report.failed"
  // Invites
  | "invite.accepted"
  // Auto-scheduling
  | "reminder.failed"
  // Reminder notifications
  | "reminder.notified"
  // Account lifecycle
  | "account.reset";

/**
 * Kinds that show up in the user-facing status strip. Most events in
 * this table are ops-shaped and shouldn't ping the user. These are the
 * ones we surface.
 */
export const USER_VISIBLE_EVENT_KINDS: SystemEventKind[] = [
  "upload.processed",
  "upload.failed",
  "report.ready",
  "report.failed",
  "invite.accepted",
  "email.error",
  "reminder.notified",
];

/**
 * Friendly, calm copy keyed by event kind. The status strip in the
 * topbar consumes this — context can override the trailing label when
 * an event carries a useful detail (e.g. the upload title).
 */
export function formatEventMessage(e: {
  kind: string;
  context: Record<string, unknown>;
  message: string | null;
}): string {
  // Deliberately generic. The global status strip sits in the topbar
  // across every page — leaking an item title like "Processed Coffee
  // with 2% milk and stevia" onto the Bills, Travel, and Calendar
  // pages was the bug the user reported. Friendly section-scoped
  // detail belongs inside the section view, not in the chrome.
  const detail =
    typeof e.context?.title === "string"
      ? String(e.context.title)
      : typeof e.context?.name === "string"
        ? String(e.context.name)
        : null;
  switch (e.kind) {
    case "upload.processed":
      return "Upload processed";
    case "upload.failed":
      return e.message ?? "Upload failed";
    case "report.ready":
      return "Report ready";
    case "report.failed":
      return e.message ?? "Report failed";
    case "invite.accepted":
      // People joining is rare + worth naming. Keep this one detailed.
      return detail ? `${detail} joined` : "Invite accepted";
    case "email.error":
      return e.message ?? "Email didn't go through";
    case "reminder.notified":
      return detail ? `Reminder: ${detail}` : "Reminder sent";
    default:
      return e.message ?? e.kind;
  }
}

export type SystemEvent = {
  id: string;
  kind: SystemEventKind | string;
  severity: SystemEventSeverity;
  message: string | null;
  context: Record<string, unknown>;
  organization_id: string | null;
  actor_id: string | null;
  created_at: string;
};

export async function recordSystemEvent(input: {
  kind: SystemEventKind | string;
  severity?: SystemEventSeverity;
  message?: string;
  context?: Record<string, unknown>;
  organizationId?: string | null;
  actorId?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("system_events").insert({
      kind: input.kind,
      severity: input.severity ?? "info",
      message: input.message ?? null,
      context: input.context ?? {},
      organization_id: input.organizationId ?? null,
      actor_id: input.actorId ?? null,
    });
  } catch {
    // Best-effort. Telemetry must never break a real request — and the
    // most likely reason this would fail is the table doesn't exist yet
    // (migration not applied), which is exactly when we DON'T want to
    // surface an error to the user.
  }
}

/** Count rows by severity in a time window. */
export async function countEvents(input: {
  kind?: SystemEventKind | string;
  severity?: SystemEventSeverity;
  sinceISO?: string;
}): Promise<number> {
  try {
    const admin = createAdminClient();
    let q = admin
      .from("system_events")
      .select("id", { count: "exact", head: true });
    if (input.kind) q = q.eq("kind", input.kind);
    if (input.severity) q = q.eq("severity", input.severity);
    if (input.sinceISO) q = q.gte("created_at", input.sinceISO);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Recent events the user should see in the topbar status strip. Scoped
 * to the orgs they belong to + the kinds we surface (USER_VISIBLE_EVENT_KINDS).
 * Default: last 24 hours, newest first, limit 10.
 */
export async function listUserVisibleEvents(input: {
  organizationIds: string[];
  sinceISO?: string;
  limit?: number;
}): Promise<SystemEvent[]> {
  if (input.organizationIds.length === 0) return [];
  try {
    const admin = createAdminClient();
    const since =
      input.sinceISO ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await admin
      .from("system_events")
      .select("*")
      .in("organization_id", input.organizationIds)
      .in("kind", USER_VISIBLE_EVENT_KINDS)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(input.limit ?? 10);
    return ((data ?? []) as SystemEvent[]).map((e) => ({
      ...e,
      context: (e.context ?? {}) as Record<string, unknown>,
    }));
  } catch {
    return [];
  }
}

/** Pull recent events of a kind. Best for the "last 10 AI errors" list. */
export async function listRecentEvents(input: {
  kind?: SystemEventKind | string;
  severity?: SystemEventSeverity;
  limit?: number;
}): Promise<SystemEvent[]> {
  try {
    const admin = createAdminClient();
    let q = admin
      .from("system_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(input.limit ?? 10);
    if (input.kind) q = q.eq("kind", input.kind);
    if (input.severity) q = q.eq("severity", input.severity);
    const { data } = await q;
    return ((data ?? []) as SystemEvent[]).map((e) => ({
      ...e,
      context: (e.context ?? {}) as Record<string, unknown>,
    }));
  } catch {
    return [];
  }
}

/**
 * Sum a numeric field across event context. Used for: total input/output
 * tokens, total estimated cost, sent/failed email totals.
 *
 * Prefer sumEventContextFields() when you need multiple totals over the
 * same (kind, time-window) — it issues ONE query and sums all fields
 * locally instead of pulling the same rows back N times.
 */
export async function sumEventContext(input: {
  kind: SystemEventKind | string;
  field: string;
  sinceISO?: string;
}): Promise<number> {
  const result = await sumEventContextFields({
    kind: input.kind,
    fields: [input.field],
    sinceISO: input.sinceISO,
  });
  return result[input.field] ?? 0;
}

/**
 * Multi-field variant. One round-trip; many sums. The admin-health page
 * was calling sumEventContext three times back-to-back for AI cost
 * stats — same rows pulled three times, 15K rows of JSON in flight per
 * render. This collapses them into one query.
 */
export async function sumEventContextFields(input: {
  kind: SystemEventKind | string;
  fields: string[];
  sinceISO?: string;
}): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const f of input.fields) out[f] = 0;
  try {
    const admin = createAdminClient();
    let q = admin
      .from("system_events")
      .select("context")
      .eq("kind", input.kind)
      .limit(5000);
    if (input.sinceISO) q = q.gte("created_at", input.sinceISO);
    const { data } = await q;
    for (const row of (data ?? []) as Array<{
      context: Record<string, unknown>;
    }>) {
      for (const f of input.fields) {
        const v = row.context?.[f];
        if (typeof v === "number") out[f] += v;
      }
    }
  } catch {
    // Best-effort. Caller already sees zero defaults.
  }
  return out;
}
