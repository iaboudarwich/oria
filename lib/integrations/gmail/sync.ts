import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { startGmailScan } from "./scan";
import { logAuditEvent } from "@/lib/data/audit-log";
import { getResend, getFromAddress, siteUrl } from "@/lib/email/client";

export type SyncResult = {
  connections: number;
  newItems: number;
  renewed: number;
  emailsSent: number;
  rateLimited: number;
};

/** Format an ISO timestamp as Gmail's `after:` date (YYYY/MM/DD), minus one
 *  day of overlap so nothing slips through between runs. */
function gmailAfterDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 24 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

async function primaryOrgId(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { organization_id: string } | null)?.organization_id ?? null;
}

/**
 * Ongoing sync across every active Gmail connection. For each one:
 *  1. incrementally scan mail received since the last sync,
 *  2. auto-apply renewals to trackables the user already approved, and
 *  3. email a short "items to review" summary when new pending items remain.
 *
 * Designed to be called from the cron route. Never throws on a single
 * connection's failure; it records the error and moves on.
 */
export async function syncAllGmailConnections(): Promise<SyncResult> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_connections")
    .select("id, user_id, email_address, last_synced_at")
    .eq("provider", "gmail")
    .eq("status", "active");

  const conns = (data as
    | { id: string; user_id: string; email_address: string; last_synced_at: string | null }[]
    | null) ?? [];

  let newItems = 0;
  let renewed = 0;
  let emailsSent = 0;
  let skipped = 0;

  // Early-signal rate limit: never scan a connection more than once an hour,
  // even if the cron fires faster. Idempotent.
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  for (const conn of conns) {
    try {
      if (conn.last_synced_at && new Date(conn.last_synced_at).getTime() > oneHourAgo) {
        skipped += 1;
        continue;
      }
      const orgId = await primaryOrgId(conn.user_id);
      const sinceQuery = conn.last_synced_at
        ? `after:${gmailAfterDate(conn.last_synced_at)}`
        : null;

      const started = await startGmailScan({
        userId: conn.user_id,
        connectionId: conn.id,
        organizationId: orgId,
        timeframeMonths: 6,
        sinceQuery,
      });
      if (!started) continue;

      // Cron awaits the work directly (no request lifecycle to detach into).
      await started.process();

      const { data: jobRow } = await admin
        .from("email_scan_jobs")
        .select("items_found")
        .eq("id", started.jobId)
        .maybeSingle();
      const foundThisRun = (jobRow as { items_found: number } | null)?.items_found ?? 0;
      newItems += foundThisRun;

      // 2. Auto-apply renewals to already-approved trackables.
      renewed += await applyAutoRenewals(conn.user_id, orgId);

      // 3. Summarise remaining pending items (only when this run found new ones).
      if (foundThisRun > 0) {
        const pending = await countPending(conn.user_id);
        if (pending > 0) {
          const sent = await sendPendingSummary(conn.user_id, pending);
          if (sent) emailsSent += 1;
        }
      }
    } catch {
      // markConnectionError already handled inside the scan; keep going.
    }
  }

  return { connections: conns.length, newItems, renewed, emailsSent, rateLimited: skipped };
}

/**
 * When a fresh subscription/bill email matches a trackable the user previously
 * approved from Gmail (same vendor), update that trackable's renewal date in
 * place and auto-approve the detected item instead of asking again.
 * Returns the number of trackables renewed.
 */
async function applyAutoRenewals(userId: string, orgId: string | null): Promise<number> {
  if (!orgId) return 0;
  const admin = createAdminClient();

  const { data: trackableRows } = await admin
    .from("trackables")
    .select("id, vendor, renewal_date, details")
    .eq("organization_id", orgId)
    .is("archived_at", null);
  const trackables = ((trackableRows as
    | { id: string; vendor: string | null; renewal_date: string | null; details: Record<string, unknown> }[]
    | null) ?? []).filter((t) => (t.details as { source?: string })?.source === "gmail" && t.vendor);

  if (trackables.length === 0) return 0;

  const { data: pendingRows } = await admin
    .from("email_detected_items")
    .select("id, item_type, extracted")
    .eq("user_id", userId)
    .eq("status", "pending")
    .in("item_type", ["subscription", "bill"]);
  const pending = (pendingRows as
    | { id: string; item_type: string; extracted: { vendor?: string | null; renewal_date?: string | null } }[]
    | null) ?? [];

  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  let renewed = 0;

  for (const item of pending) {
    const vendor = norm(item.extracted?.vendor);
    if (!vendor) continue;
    const match = trackables.find((t) => norm(t.vendor) === vendor);
    if (!match) continue;

    const newDate = item.extracted?.renewal_date;
    if (newDate) {
      const newMs = new Date(newDate).getTime();
      const curMs = match.renewal_date ? new Date(match.renewal_date).getTime() : 0;
      if (!Number.isNaN(newMs) && newMs > curMs) {
        await admin.from("trackables").update({ renewal_date: newDate }).eq("id", match.id);
      }
    }

    await admin
      .from("email_detected_items")
      .update({
        status: "approved",
        resulting_trackable_id: match.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    await logAuditEvent({
      userId,
      organizationId: orgId,
      action: "email.trackable_renewed",
      resourceType: "trackable",
      resourceId: match.id,
      metadata: { source: "gmail", detected_item_id: item.id, renewal_date: newDate ?? null },
    });
    renewed += 1;
  }

  return renewed;
}

async function countPending(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("email_detected_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending");
  return count ?? 0;
}

/** Send a short "items waiting to review" email. Returns true when sent. */
async function sendPendingSummary(userId: string, pending: number): Promise<boolean> {
  const resend = getResend();
  const from = getFromAddress();
  if (!resend || !from) return false;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", userId)
    .maybeSingle();
  const to = (profile as { email: string; full_name: string | null } | null)?.email;
  if (!to) return false;

  const name = (profile as { full_name: string | null }).full_name ?? "there";
  const url = `${siteUrl().replace(/\/$/, "")}/dashboard/connections/gmail/review`;
  const label = pending === 1 ? "1 new item" : `${pending} new items`;

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `${label} from your inbox to review`,
      text: `Hi ${name},\n\nOria found ${label} in your email that may be worth tracking. Nothing is added until you approve it.\n\nReview them here: ${url}\n`,
      html: `<p>Hi ${name},</p><p>Oria found <strong>${label}</strong> in your email that may be worth tracking. Nothing is added until you approve it.</p><p><a href="${url}">Review them</a></p>`,
    });
    return !error;
  } catch {
    return false;
  }
}
