import "server-only";

import { recordSystemEvent } from "./system-events";

/**
 * Scope-isolation guard. Every read that returns org-scoped rows
 * should pass them through here so that:
 *   1. Any row whose `organization_id` doesn't match the expected
 *      org is DROPPED (defence in depth — even if a query is wrong,
 *      the data never reaches the UI).
 *   2. The mismatch is logged to system_events as `scope_violation`
 *      with the call-site label, so operators see leak attempts on
 *      the admin health page.
 *
 * This is a runtime safety net, not a substitute for correct queries.
 * Use it on every list/aggregate that touches uploads, memory_items,
 * reminders, extractions, learning_events, or any table where rows
 * carry an organization_id.
 */

type WithOrgId = { organization_id: string | null | undefined };

export function enforceActiveOrg<T extends WithOrgId>(
  rows: T[],
  expectedOrgId: string,
  callSite: string,
): T[] {
  if (!expectedOrgId) {
    // Fail closed: no active org means render nothing.
    return [];
  }
  const out: T[] = [];
  const violators: Array<{ org: string | null | undefined }> = [];
  for (const r of rows) {
    if (r.organization_id === expectedOrgId) {
      out.push(r);
    } else {
      violators.push({ org: r.organization_id });
    }
  }
  if (violators.length > 0) {
    void recordSystemEvent({
      kind: "scope.violation",
      severity: "error",
      message: `Scope violation in ${callSite}: dropped ${violators.length} cross-org row(s)`,
      context: {
        callSite,
        expectedOrgId,
        violatingOrgIds: Array.from(
          new Set(violators.map((v) => v.org ?? "null")),
        ),
        droppedCount: violators.length,
      },
      organizationId: expectedOrgId,
    });
  }
  return out;
}

/**
 * Same guard for a list of allowed org ids (cross-space God's Eye
 * mode). Use sparingly — only the Personal-owner explicit toggle.
 */
export function enforceAllowedOrgs<T extends WithOrgId>(
  rows: T[],
  allowedOrgIds: ReadonlySet<string>,
  callSite: string,
): T[] {
  if (allowedOrgIds.size === 0) return [];
  const out: T[] = [];
  const violators: Array<{ org: string | null | undefined }> = [];
  for (const r of rows) {
    if (r.organization_id && allowedOrgIds.has(r.organization_id)) {
      out.push(r);
    } else {
      violators.push({ org: r.organization_id });
    }
  }
  if (violators.length > 0) {
    void recordSystemEvent({
      kind: "scope.violation",
      severity: "error",
      message: `Scope violation in ${callSite}: dropped ${violators.length} cross-org row(s)`,
      context: {
        callSite,
        allowedOrgIds: Array.from(allowedOrgIds),
        violatingOrgIds: Array.from(
          new Set(violators.map((v) => v.org ?? "null")),
        ),
        droppedCount: violators.length,
      },
    });
  }
  return out;
}

/**
 * Helper for callers that need a non-empty active org id and should
 * fail closed when there isn't one (or when the row's id is null).
 * Throws when the caller can't recover.
 */
export function requireActiveOrgId(
  ctx: { organization?: { id?: string | null } | null } | null,
): string {
  const id = ctx?.organization?.id;
  if (!id) throw new Error("scope: no active organization");
  return id;
}
