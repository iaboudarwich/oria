import "server-only";

import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreshGmailAccessToken, markConnectionError, markConnectionSynced } from "./connections";
import { classifyEmail, type ScannedEmail, type EmailClassification } from "./classify";
import { autoRoutePendingItems } from "./apply";
import {
  resolveWorkspaceOrgs,
  chooseOrgForEmail,
  type WorkspaceRouting,
} from "./workspace";
import { computeSectionSuggestions } from "@/lib/sections/suggest-sections";
import { logAuditEvent } from "@/lib/data/audit-log";

const SIDECAR_URL =
  process.env.PYTHON_EXTRACTION_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

/** HMAC headers matching the sidecar's require_signature scheme. */
function sidecarAuthHeaders(method: "POST", path: string): Record<string, string> {
  const secret = process.env.ORIA_SIDECAR_SECRET;
  if (!secret) return {};
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac("sha256", secret).update(`${ts}:${method}:${path}`).digest("hex");
  return { "X-Oria-Timestamp": ts, "X-Oria-Signature": `sha256=${sig}` };
}

/**
 * Ask the Python sidecar to fetch + parse recent Gmail messages.
 * The access token travels only in this signed server-to-server request body
 * and is never logged. Returns [] when the sidecar is unreachable.
 */
export type ConnectionFilters = {
  excludeKeywords: string[];
  excludeSenders: string[];
  excludeWithAttachments: boolean;
};

async function fetchGmailMessages(input: {
  accessToken: string;
  timeframeMonths: number;
  sinceQuery?: string | null;
  maxMessages?: number;
  filters?: ConnectionFilters;
}): Promise<{ emails: ScannedEmail[]; skipped: number }> {
  try {
    const res = await fetch(`${SIDECAR_URL}/gmail/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...sidecarAuthHeaders("POST", "/gmail/scan"),
      },
      body: JSON.stringify({
        access_token: input.accessToken,
        timeframe_months: input.timeframeMonths,
        since_query: input.sinceQuery ?? null,
        max_messages: input.maxMessages ?? 150,
        exclude_keywords: input.filters?.excludeKeywords ?? [],
        exclude_senders: input.filters?.excludeSenders ?? [],
        exclude_with_attachments: input.filters?.excludeWithAttachments ?? false,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      throw new Error(`sidecar /gmail/scan HTTP ${res.status}`);
    }
    const json = (await res.json()) as { emails: ScannedEmail[]; skipped?: number };
    return { emails: json.emails ?? [], skipped: json.skipped ?? 0 };
  } catch (err) {
    // Never include the token; surface only the error name.
    console.warn("[gmail/scan] sidecar request failed:", (err as Error).name);
    throw err;
  }
}

export type ScanJobStatus = {
  id: string;
  status: "running" | "completed" | "failed" | "canceled";
  emailsTotal: number;
  emailsProcessed: number;
  itemsFound: number;
  emailsSkipped: number;
  startedAt: string;
  completedAt: string | null;
  lastError: string | null;
};

/** Latest scan job for the user (for the review page's progress banner). */
export async function getLatestScanJob(userId: string): Promise<ScanJobStatus | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_scan_jobs")
    .select("id, status, emails_total, emails_processed, items_found, emails_skipped, started_at, completed_at, last_error")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    status: r.status as ScanJobStatus["status"],
    emailsSkipped: (r.emails_skipped as number) ?? 0,
    emailsTotal: (r.emails_total as number) ?? 0,
    emailsProcessed: (r.emails_processed as number) ?? 0,
    itemsFound: (r.items_found as number) ?? 0,
    startedAt: r.started_at as string,
    completedAt: (r.completed_at as string) ?? null,
    lastError: (r.last_error as string) ?? null,
  };
}

export type DetectedItem = {
  id: string;
  itemType: string;
  status: "pending" | "approved" | "dismissed";
  sourceSubject: string | null;
  sourceFrom: string | null;
  sourceDate: string | null;
  confidence: number | null;
  extracted: {
    title?: string;
    vendor?: string | null;
    amount?: number | null;
    currency?: string | null;
    period?: string | null;
    renewal_date?: string | null;
    event_date?: string | null;
    summary?: string | null;
    order_id?: string | null;
    due_date?: string | null;
    origin?: string | null;
    destination?: string | null;
    departure?: string | null;
    location?: string | null;
    provider?: string | null;
    [key: string]: unknown;
  };
};

/** List the user's detected items, newest first. Optionally filter by status. */
export async function listDetectedItems(
  userId: string,
  status?: "pending" | "approved" | "dismissed",
): Promise<DetectedItem[]> {
  const admin = createAdminClient();
  let query = admin
    .from("email_detected_items")
    .select("id, item_type, status, source_subject, source_from, source_date, confidence, extracted")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: r.id as string,
    itemType: r.item_type as string,
    status: r.status as DetectedItem["status"],
    sourceSubject: (r.source_subject as string) ?? null,
    sourceFrom: (r.source_from as string) ?? null,
    sourceDate: (r.source_date as string) ?? null,
    confidence: (r.confidence as number) ?? null,
    extracted: (r.extracted as DetectedItem["extracted"]) ?? {},
  }));
}

const CLASSIFY_BATCH = 6;

// Store anything the classifier is at least this sure of. Deliberately low:
// the review UI shows the confidence so the user does the final filtering.
const MIN_CONFIDENCE = 0.4;

/**
 * Begin a Gmail scan: refresh the token and create a `running` job row.
 * Returns the job id plus a `process()` runnable that does the heavy
 * fetch + classify + store. The caller decides how to run it: a route wraps
 * `process` in `after()` so the HTTP response returns immediately, while the
 * cron (F4) can `await` it directly.
 *
 * Detected items are NEVER auto-applied; approval (F3) creates the trackable.
 * Returns null when there is no usable connection.
 */
export async function startGmailScan(input: {
  userId: string;
  organizationId: string | null;
  timeframeMonths: number;
  sinceQuery?: string | null;
}): Promise<{ jobId: string; process: () => Promise<void> } | null> {
  const admin = createAdminClient();

  const token = await getFreshGmailAccessToken(input.userId);
  if (!token) return null;

  // Load this connection's confidentiality filters + workspace routing.
  const { data: connRow } = await admin
    .from("email_connections")
    .select("exclude_keywords, exclude_senders, exclude_with_attachments, workspace_routing")
    .eq("id", token.connectionId)
    .maybeSingle();
  const conn = (connRow as {
    exclude_keywords?: string[];
    exclude_senders?: string[];
    exclude_with_attachments?: boolean;
    workspace_routing?: WorkspaceRouting;
  } | null) ?? {};
  const filters: ConnectionFilters = {
    excludeKeywords: conn.exclude_keywords ?? [],
    excludeSenders: conn.exclude_senders ?? [],
    excludeWithAttachments: conn.exclude_with_attachments ?? false,
  };
  const workspaceRouting: WorkspaceRouting = conn.workspace_routing ?? "personal";

  const { data: jobRow } = await admin
    .from("email_scan_jobs")
    .insert({
      connection_id: token.connectionId,
      user_id: input.userId,
      timeframe_months: input.timeframeMonths,
      status: "running",
    })
    .select("id")
    .single();
  const jobId = (jobRow as { id: string } | null)?.id;
  if (!jobId) return null;

  return {
    jobId,
    process: async () => {
      await processScan({
        ...input,
        jobId,
        connectionId: token.connectionId,
        accessToken: token.accessToken,
        filters,
        workspaceRouting,
      });
    },
  };
}

async function processScan(input: {
  userId: string;
  organizationId: string | null;
  timeframeMonths: number;
  sinceQuery?: string | null;
  jobId: string;
  connectionId: string;
  accessToken: string;
  filters: ConnectionFilters;
  workspaceRouting: WorkspaceRouting;
}): Promise<void> {
  const admin = createAdminClient();
  try {
    const { emails, skipped } = await fetchGmailMessages({
      accessToken: input.accessToken,
      timeframeMonths: input.timeframeMonths,
      sinceQuery: input.sinceQuery,
      filters: input.filters,
    });

    // Resolve workspace orgs once for per-email routing.
    const orgs = await resolveWorkspaceOrgs(input.userId);
    const fallbackOrg = input.organizationId;

    await admin
      .from("email_scan_jobs")
      .update({ emails_total: emails.length, emails_skipped: skipped })
      .eq("id", input.jobId);

    let processed = 0;
    let found = 0;

    for (let i = 0; i < emails.length; i += CLASSIFY_BATCH) {
      const batch = emails.slice(i, i + CLASSIFY_BATCH);
      const results = await Promise.all(
        batch.map((e) => classifyEmail(e).then((c) => ({ email: e, classification: c }))),
      );

      for (const { email, classification } of results) {
        if (
          classification &&
          classification.is_relevant &&
          classification.confidence >= MIN_CONFIDENCE
        ) {
          const targetOrg = fallbackOrg
            ? chooseOrgForEmail({
                routing: input.workspaceRouting,
                orgs,
                sender: email.sender,
                subject: email.subject,
                fallbackOrgId: fallbackOrg,
              })
            : null;
          const inserted = await insertDetectedItem({
            userId: input.userId,
            organizationId: targetOrg,
            connectionId: input.connectionId,
            scanJobId: input.jobId,
            email,
            classification,
          });
          if (inserted) found += 1;
        }
      }

      processed += batch.length;
      await admin
        .from("email_scan_jobs")
        .update({ emails_processed: processed, items_found: found })
        .eq("id", input.jobId);
    }

    await admin
      .from("email_scan_jobs")
      .update({
        status: "completed",
        emails_processed: emails.length,
        items_found: found,
        completed_at: new Date().toISOString(),
      })
      .eq("id", input.jobId);

    await markConnectionSynced(input.connectionId);

    await logAuditEvent({
      userId: input.userId,
      organizationId: input.organizationId,
      action: "email.scan_completed",
      resourceType: "email_scan_job",
      resourceId: input.jobId,
      metadata: { source: "gmail", emails_total: emails.length, items_found: found },
    });

    // Auto-route per preference, then look for a new-section suggestion.
    if (input.organizationId) {
      await autoRoutePendingItems(input.userId, input.organizationId);
      await computeSectionSuggestions(input.userId, input.organizationId);
    }
  } catch (err) {
    await admin
      .from("email_scan_jobs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        last_error: (err as Error).message.slice(0, 300),
      })
      .eq("id", input.jobId);
    await markConnectionError(input.userId, "Scan failed");
  }
}

/** Insert one detected item (idempotent on user_id, source_email_id, item_type). */
async function insertDetectedItem(input: {
  userId: string;
  organizationId: string | null;
  connectionId: string;
  scanJobId: string;
  email: ScannedEmail;
  classification: EmailClassification;
}): Promise<boolean> {
  const admin = createAdminClient();
  const c = input.classification;
  const { error } = await admin.from("email_detected_items").upsert(
    {
      scan_job_id: input.scanJobId,
      connection_id: input.connectionId,
      user_id: input.userId,
      organization_id: input.organizationId,
      source_email_id: input.email.id,
      source_subject: input.email.subject.slice(0, 500),
      source_from: input.email.sender.slice(0, 300),
      source_date: parseEmailDate(input.email.date),
      item_type: c.item_type,
      extracted: {
        title: c.title,
        vendor: c.vendor ?? null,
        amount: c.amount ?? null,
        currency: c.currency ?? null,
        summary: c.summary ?? null,
        period: c.period ?? null,
        renewal_date: c.renewal_date ?? null,
        event_date: c.event_date ?? null,
        order_id: c.order_id ?? null,
        item_description: c.item_description ?? null,
        due_date: c.due_date ?? null,
        account: c.account ?? null,
        period_covered: c.period_covered ?? null,
        airline: c.airline ?? null,
        flight_number: c.flight_number ?? null,
        origin: c.origin ?? null,
        destination: c.destination ?? null,
        departure: c.departure ?? null,
        arrival: c.arrival ?? null,
        passenger: c.passenger ?? null,
        booking_type: c.booking_type ?? null,
        location: c.location ?? null,
        provider: c.provider ?? null,
        appointment_type: c.appointment_type ?? null,
      },
      confidence: c.confidence,
      status: "pending",
    },
    { onConflict: "user_id,source_email_id,item_type", ignoreDuplicates: true },
  );
  return !error;
}

/** Best-effort parse of an RFC 2822 Date header to ISO; null on failure. */
function parseEmailDate(raw: string | null): string | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
