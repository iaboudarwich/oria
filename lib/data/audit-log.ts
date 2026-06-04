import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Self-serve security audit log.
 *
 * Distinct from `system_events` (operator-facing, cross-org). This is
 * user-visible activity scoped to their own account: sign-ins, sign-
 * outs, uploads they opened, settings they changed, sensitive actions.
 *
 * Writes go through the service-role admin client (RLS allows SELECT
 * only). The helper is fire-and-forget — it must never throw because
 * a single audit failure should never break a real user action.
 *
 * IP + user-agent are captured at call time from the active request
 * headers. We do NOT enrich here (no GeoIP lookup, no UA parsing) so
 * inserts stay cheap; the Settings view does the GeoIP / UA-summary
 * step lazily at render time.
 */

/**
 * Action verbs are kebab-snake namespaces. Add to the union when you
 * wire a new event. Keep the alphabet small — every entry needs to
 * map to a friendly label in the UI.
 */
export type AuditAction =
  // Auth
  | "auth.signin.success"
  | "auth.signin.failure"
  | "auth.signin.mfa.success"
  | "auth.signin.mfa.failure"
  | "auth.signout"
  | "auth.signout.global"
  | "auth.session.revoke"
  // MFA lifecycle
  | "mfa.enrolled"
  | "mfa.disabled"
  | "mfa.backup_codes.rotated"
  // Settings
  | "settings.password.changed"
  | "settings.language.changed"
  | "settings.theme.changed"
  | "settings.appearance.changed"
  | "settings.preferences.changed"
  | "settings.understanding.reset"
  // Uploads
  | "upload.view"
  | "upload.download"
  | "upload.delete"
  | "upload.restore"
  | "upload.group_created"
  | "upload.group_extracted"
  | "upload.group_confirmed"
  | "upload.group_split"
  | "upload.group_merged"
  // Reminders
  | "reminder.created"
  | "reminder.deleted"
  // Members
  | "member.invite.created"
  | "member.invite.revoked"
  | "member.invite.accepted"
  | "member.removed"
  // Data lifecycle
  | "account.export"
  | "account.reset"
  | "account.delete"
  // Email integration (Gmail)
  | "email.connected"
  | "email.disconnected"
  | "email.scan_completed"
  | "email.item_approved"
  | "email.item_dismissed"
  | "email.trackable_renewed"
  // Cloud services (Google Calendar, Drive)
  | "cloud.connected"
  | "cloud.disconnected"
  | "cloud.calendar_synced"
  | "cloud.file_linked"
  | "cloud.file_unlinked"
  // AI provider (bring-your-own Claude / ChatGPT / Gemini)
  | "ai_connection_added"
  | "ai_connection_removed"
  // Sections
  | "section.suggested"
  | "section.created_from_suggestion"
  // Learned routing
  | "routing_rule_learned"
  | "routing_rule_removed"
  // Onboarding + reshape
  | "onboarding_executed"
  | "setup_reconfigured"
  | "setup_change_executed"
  | "setup_change_reverted"
  | "setup_change_purged"
  | "ask_setup_intent_detected"
  | "ask_setup_intent_rejected"
  | "ask_setup_intent_with_image_detected"
  | "ask_setup_intent_with_image_rejected"
  | "setup_template_retired"
  | "calendar_sources_updated"
  | "space_theme_variant_updated"
  // Account security
  | "email.verified"
  | "2fa.prompt_shown"
  | "2fa.prompt_dismissed"
  // Web push (PWA)
  | "push.subscribed"
  | "push.unsubscribed"
  // Routines (Round 16)
  | "routine.created"
  | "routine.updated"
  | "routine.deleted"
  | "routine.executed"
  // Daily Journal (Round 16)
  | "journal.created"
  // Suggestions (Round 16)
  | "suggestion.accepted"
  | "suggestion.dismissed"
  | "suggestion.commented"
  // Today surface (Round 16)
  | "today.rollover"
  | "today.focus_blocked"
  // Pattern memory + privacy gate (Round 14.6)
  | "pattern.learned"
  | "privacy.connect_acknowledged"
  // Spaces
  | "space.deleted";

export type AuditLogInput = {
  userId: string;
  action: AuditAction;
  organizationId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Record an audit event. Pulls IP + UA from the request headers at
 * call time. Safe to call from Server Actions, Route Handlers, and
 * server components. Never throws.
 */
export async function logAuditEvent(input: AuditLogInput): Promise<void> {
  try {
    const { ip, userAgent } = await readRequestFingerprint();
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      user_id: input.userId,
      organization_id: input.organizationId ?? null,
      action: input.action,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      ip_address: ip,
      user_agent: userAgent,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Fire-and-forget. A single audit failure must not break a real
    // user action, and the most common failure mode in development
    // is the table not existing yet (migration not applied).
  }
}

/**
 * Variant for the sign-in failure path where we don't have a Supabase
 * user yet — we know the email but no user_id. Stored with a null
 * user_id and the email in metadata so the user can see "someone
 * tried my email from <ip>" if we ever expose that.
 *
 * Today the read RLS requires user_id = auth.uid(), so anon failures
 * are write-only and visible only to admins via the service role.
 * That's intentional: surfacing "someone failed your password" to
 * arbitrary visitors would leak account-existence.
 */
export async function logAnonAuthFailure(input: {
  email: string;
  reason: string;
}): Promise<void> {
  try {
    const { ip, userAgent } = await readRequestFingerprint();
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      user_id: null,
      organization_id: null,
      action: "auth.signin.failure" satisfies AuditAction,
      resource_type: null,
      resource_id: null,
      ip_address: ip,
      user_agent: userAgent,
      metadata: { email: input.email, reason: input.reason },
    });
  } catch {
    // best-effort
  }
}

/** Pull the request's client IP + UA. Both can be null in non-request
 *  contexts (background jobs, cron, etc.); the column types allow it. */
async function readRequestFingerprint(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    // Vercel forwards client IP via x-forwarded-for (comma-separated;
    // the first entry is the original client). x-real-ip is a fallback.
    const fwd = h.get("x-forwarded-for");
    const ip =
      (fwd && fwd.split(",")[0]?.trim()) ||
      h.get("x-real-ip") ||
      null;
    const userAgent = h.get("user-agent") || null;
    return { ip, userAgent };
  } catch {
    // Called from a context without request headers (e.g. inside
    // Next's after() callback). Audit row still lands; just without
    // network attribution.
    return { ip: null, userAgent: null };
  }
}

/* ------------------------------------------------------------------ */
/* Reads (rendered on the Security tab)                                */
/* ------------------------------------------------------------------ */

export type AuditEvent = {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

/** Most recent audit events for the current user, newest first. */
export async function listRecentAuditEvents(
  userId: string,
  limit = 100,
): Promise<AuditEvent[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("audit_log")
    .select(
      "id, user_id, organization_id, action, resource_type, resource_id, ip_address, user_agent, metadata, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AuditEvent[];
}

/** Full export of every audit row for a user. Used by the "Download
 *  full log" button on the Security tab. */
export async function exportAuditLog(userId: string): Promise<AuditEvent[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("audit_log")
    .select(
      "id, user_id, organization_id, action, resource_type, resource_id, ip_address, user_agent, metadata, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as AuditEvent[];
}

/* ------------------------------------------------------------------ */
/* UA + GeoIP summarisation (display only, no PII enrichment calls)    */
/* ------------------------------------------------------------------ */

/** Reduce a raw user-agent string to "Browser on OS" (e.g. "Safari on
 *  macOS"). Defensive: any unmatched input falls back to "Unknown". */
export function summariseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua) && !/OPR\//.test(ua)
      ? "Chrome"
      : /Safari\//.test(ua) && !/Chrome\//.test(ua)
        ? "Safari"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Postman|curl|axios|node/i.test(ua)
            ? "API client"
            : "Browser";
  const os = /Windows NT/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  return `${browser} on ${os}`;
}

/** Friendly label for an action verb. Kept here (vs in the UI) so the
 *  export JSON can include it too. */
export function actionLabel(action: string): string {
  const map: Record<string, string> = {
    "auth.signin.success":          "Signed in",
    "auth.signin.failure":          "Sign-in failed",
    "auth.signin.mfa.success":      "Two-factor verified",
    "auth.signin.mfa.failure":      "Two-factor failed",
    "auth.signout":                 "Signed out",
    "auth.signout.global":          "Signed out everywhere",
    "auth.session.revoke":          "Revoked a session",
    "mfa.enrolled":                 "Enabled 2FA",
    "mfa.disabled":                 "Disabled 2FA",
    "mfa.backup_codes.rotated":     "Rotated backup codes",
    "settings.password.changed":    "Changed password",
    "settings.preferences.changed": "Updated preferences",
    "settings.appearance.changed":  "Changed display settings",
    "settings.understanding.reset": "Reset Oria's understanding",
    "settings.language.changed":    "Changed language",
    "settings.theme.changed":       "Changed theme",
    "upload.view":                  "Opened an upload",
    "upload.download":              "Downloaded an upload",
    "upload.delete":                "Deleted an upload",
    "upload.restore":               "Restored an upload",
    "upload.group_created":         "Grouped images for one extraction",
    "upload.group_extracted":       "Read a group of images together",
    "upload.group_confirmed":       "Confirmed a grouped record",
    "upload.group_split":           "Split a grouped record",
    "upload.group_merged":          "Merged grouped records into one",
    "reminder.created":             "Created a reminder",
    "reminder.deleted":             "Deleted a reminder",
    "member.invite.created":        "Sent an invite",
    "member.invite.revoked":        "Revoked an invite",
    "member.invite.accepted":       "Accepted an invite",
    "member.removed":               "Removed a member",
    "account.export":               "Exported account data",
    "account.reset":                "Reset account",
    "account.delete":               "Deleted account",
    "email.connected":              "Connected Gmail",
    "email.disconnected":           "Disconnected Gmail",
    "email.scan_completed":         "Completed an email scan",
    "email.item_approved":          "Approved an email item",
    "email.item_dismissed":         "Dismissed an email item",
    "email.trackable_renewed":      "Renewed a trackable from email",
    "cloud.connected":              "Connected a Google service",
    "cloud.disconnected":           "Disconnected a Google service",
    "cloud.calendar_synced":        "Synced calendar events",
    "cloud.file_linked":            "Linked a Google Drive file",
    "cloud.file_unlinked":          "Removed a linked Drive file",
    "ai_connection_added":          "Connected an AI provider",
    "ai_connection_removed":        "Disconnected an AI provider",
    "section.suggested":            "Suggested a new section",
    "section.created_from_suggestion": "Created a section from a suggestion",
    "routing_rule_learned":         "Taught Oria a filing rule",
    "routing_rule_removed":         "Removed a learned filing rule",
    "onboarding_executed":          "Built the initial workspace setup",
    "setup_reconfigured":           "Reshaped the workspace setup",
    "setup_change_executed":        "Applied a setup change",
    "setup_change_reverted":        "Undid a setup change",
    "setup_change_purged":          "Permanently removed an archived item",
    "ask_setup_intent_detected":    "Routed an Ask to reshape",
    "ask_setup_intent_rejected":    "Kept an Ask as a question",
    "ask_setup_intent_with_image_detected": "Routed an image Ask to reshape",
    "ask_setup_intent_with_image_rejected": "Kept an image Ask as a question",
    "setup_template_retired":        "Migrated a space to a neutral setup",
    "calendar_sources_updated":      "Changed calendar source filters",
    "space_theme_variant_updated":   "Changed a space's light or dark theme",
    "space.deleted":                "Deleted a workspace or circle",
    "email.verified":               "Verified email address",
    "2fa.prompt_shown":             "Shown the two-factor setup prompt",
    "2fa.prompt_dismissed":         "Dismissed the two-factor setup prompt",
    "routine.created":              "Created a routine",
    "routine.updated":              "Updated a routine",
    "routine.deleted":              "Deleted a routine",
    "routine.executed":             "Ran a routine",
    "journal.created":              "Wrote a daily journal entry",
    "suggestion.accepted":          "Accepted a suggestion",
    "suggestion.dismissed":         "Dismissed a suggestion",
    "suggestion.commented":         "Commented on a suggestion",
    "today.rollover":               "Carried unfinished items to today",
    "today.focus_blocked":          "Blocked focus time",
    "pattern.learned":              "Oria learned a pattern",
    "privacy.connect_acknowledged": "Acknowledged the privacy notice",
  };
  return map[action] ?? action;
}
