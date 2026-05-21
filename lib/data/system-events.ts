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
  | "upload.failed"
  | "extraction.skipped"
  // Reports
  | "report.failed"
  // Auto-scheduling
  | "reminder.failed";

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
 */
export async function sumEventContext(input: {
  kind: SystemEventKind | string;
  field: string;
  sinceISO?: string;
}): Promise<number> {
  try {
    const admin = createAdminClient();
    let q = admin
      .from("system_events")
      .select("context")
      .eq("kind", input.kind)
      .limit(5000);
    if (input.sinceISO) q = q.gte("created_at", input.sinceISO);
    const { data } = await q;
    let total = 0;
    for (const row of (data ?? []) as Array<{ context: Record<string, unknown> }>) {
      const v = row.context?.[input.field];
      if (typeof v === "number") total += v;
    }
    return total;
  } catch {
    return 0;
  }
}
