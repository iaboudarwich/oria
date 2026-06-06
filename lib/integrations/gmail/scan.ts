import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sidecarAuthHeaders } from "@/lib/google/shared/sidecar-auth";
import { getFreshGmailAccessToken, markConnectionError, markConnectionSynced } from "./connections";
import { classifyEmail, type ScannedEmail, type EmailClassification } from "./classify";
import { autoRoutePendingItems } from "./apply";
import { resolveWorkspaceOrgs, chooseOrgForEmail, type WorkspaceRouting } from "./workspace";
import { computeSectionSuggestions } from "@/lib/sections/suggest-sections";
import { logAuditEvent } from "@/lib/data/audit-log";

const SIDECAR_URL =
  process.env.PYTHON_EXTRACTION_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

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

export type AggregateScanStatus = {
  status: "running" | "completed" | "failed" | "idle";
  inboxes: number;
  inboxesScanning: number;
  emailsTotal: number;
  emailsProcessed: number;
  itemsFound: number;
  emailsSkipped: number;
};

/**
 * Aggregate the most recent scan job across all of the user's connections, so
 * the review page can show "Scanning N inboxes. X of Y checked. Z found."
 */
export async function getAggregateScanStatus(userId: string): Promise<AggregateScanStatus> {
  const admin = createAdminClient();
  // Active connection ids.
  const { data: conns } = await admin
    .from("email_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "gmail");
  const connIds = ((conns as { id: string }[] | null) ?? []).map((c) => c.id);

  const agg: AggregateScanStatus = {
    status: "idle",
    inboxes: connIds.length,
    inboxesScanning: 0,
    emailsTotal: 0,
    emailsProcessed: 0,
    itemsFound: 0,
    emailsSkipped: 0,
  };
  if (connIds.length === 0) return agg;

  let anyRunning = false;
  let anyFailed = false;
  let anyJob = false;

  // Latest job per connection.
  await Promise.all(
    connIds.map(async (cid) => {
      const { data } = await admin
        .from("email_scan_jobs")
        .select("status, emails_total, emails_processed, items_found, emails_skipped")
        .eq("connection_id", cid)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return;
      const r = data as Record<string, unknown>;
      anyJob = true;
      agg.emailsTotal += (r.emails_total as number) ?? 0;
      agg.emailsProcessed += (r.emails_processed as number) ?? 0;
      agg.itemsFound += (r.items_found as number) ?? 0;
      agg.emailsSkipped += (r.emails_skipped as number) ?? 0;
      const status = r.status as string;
      if (status === "running") {
        anyRunning = true;
        agg.inboxesScanning += 1;
      } else if (status === "failed") {
        anyFailed = true;
      }
    }),
  );

  agg.status = anyRunning ? "running" : anyFailed ? "failed" : anyJob ? "completed" : "idle";
  return agg;
}

export type DetectedItem = {
  id: string;
  connectionId: string | null;
  sourceEmail: string | null;
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

/**
 * List the user's detected items, newest first, each tagged with its source
 * connection + email (for the per-source badge and filter chips). Optionally
 * filter by status.
 */
export async function listDetectedItems(
  userId: string,
  status?: "pending" | "approved" | "dismissed",
): Promise<DetectedItem[]> {
  const admin = createAdminClient();
  let query = admin
    .from("email_detected_items")
    .select(
      "id, connection_id, item_type, status, source_subject, source_from, source_date, confidence, extracted, email_connections(email_address)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return ((data as Record<string, unknown>[]) ?? []).map((r) => {
    const conn = r.email_connections as
      | { email_address?: string }
      | { email_address?: string }[]
      | null;
    const connObj = Array.isArray(conn) ? conn[0] : conn;
    return {
      id: r.id as string,
      connectionId: (r.connection_id as string) ?? null,
      sourceEmail: connObj?.email_address ?? null,
      itemType: r.item_type as string,
      status: r.status as DetectedItem["status"],
      sourceSubject: (r.source_subject as string) ?? null,
      sourceFrom: (r.source_from as string) ?? null,
      sourceDate: (r.source_date as string) ?? null,
      confidence: (r.confidence as number) ?? null,
      extracted: (r.extracted as DetectedItem["extracted"]) ?? {},
    };
  });
}

/**
 * Start scans for every active connection the user has, concurrently. Returns
 * the started jobs (each with a `process()` runnable the caller backgrounds).
 */
export async function scanAllConnections(input: {
  userId: string;
  organizationId: string | null;
  timeframeMonths: number;
}): Promise<{ connectionId: string; jobId: string; process: () => Promise<void> }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_connections")
    .select("id")
    .eq("user_id", input.userId)
    .eq("provider", "gmail")
    .eq("status", "active");
  const connIds = ((data as { id: string }[] | null) ?? []).map((c) => c.id);

  const started = await Promise.all(
    connIds.map(async (connectionId) => {
      const s = await startGmailScan({
        userId: input.userId,
        connectionId,
        organizationId: input.organizationId,
        timeframeMonths: input.timeframeMonths,
      });
      return s ? { connectionId, jobId: s.jobId, process: s.process } : null;
    }),
  );
  return started.filter((s): s is NonNullable<typeof s> => s !== null);
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
  connectionId: string;
  organizationId: string | null;
  timeframeMonths: number;
  sinceQuery?: string | null;
}): Promise<{ jobId: string; process: () => Promise<void> } | null> {
  const admin = createAdminClient();

  const token = await getFreshGmailAccessToken(input.connectionId);
  if (!token) return null;

  // Load this connection's confidentiality filters + routing config.
  const { data: connRow } = await admin
    .from("email_connections")
    .select(
      "exclude_keywords, exclude_senders, exclude_with_attachments, workspace_routing, routing_mode, routing_target_org_ids",
    )
    .eq("id", token.connectionId)
    .maybeSingle();
  const conn =
    (connRow as {
      exclude_keywords?: string[];
      exclude_senders?: string[];
      exclude_with_attachments?: boolean;
      workspace_routing?: WorkspaceRouting;
      routing_mode?: "auto" | "fixed";
      routing_target_org_ids?: string[];
    } | null) ?? {};
  const filters: ConnectionFilters = {
    excludeKeywords: conn.exclude_keywords ?? [],
    excludeSenders: conn.exclude_senders ?? [],
    excludeWithAttachments: conn.exclude_with_attachments ?? false,
  };
  const workspaceRouting: WorkspaceRouting = conn.workspace_routing ?? "personal";
  const routingMode: "auto" | "fixed" = conn.routing_mode ?? "auto";
  const routingTargets = conn.routing_target_org_ids ?? [];

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
      await runEmailScan({
        userId: input.userId,
        organizationId: input.organizationId,
        jobId,
        connectionId: token.connectionId,
        source: "gmail",
        workspaceRouting,
        routingMode,
        routingTargets,
        fetch: () =>
          fetchGmailMessages({
            accessToken: token.accessToken,
            timeframeMonths: input.timeframeMonths,
            sinceQuery: input.sinceQuery,
            filters,
          }),
      });
    },
  };
}

/**
 * Shared post-fetch ingest loop for any email provider (Gmail, Outlook). Given
 * a provider-specific `fetch` thunk that returns parsed messages, it classifies,
 * routes, stores detected items, tracks the scan job, audits, and auto-routes,
 * recording a job failure on error. The classify/store/route logic is identical
 * across providers; only the fetch + the audit `source` differ.
 */
export async function runEmailScan(input: {
  userId: string;
  organizationId: string | null;
  jobId: string;
  connectionId: string;
  source: "gmail" | "outlook";
  workspaceRouting: WorkspaceRouting;
  routingMode: "auto" | "fixed";
  routingTargets: string[];
  fetch: () => Promise<{ emails: ScannedEmail[]; skipped: number }>;
}): Promise<void> {
  const admin = createAdminClient();
  try {
    const { emails, skipped } = await input.fetch();

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
          // Fixed routing pins every item to the chosen target(s); the primary
          // (first) target owns the item row, and approval files copies into the
          // rest. Auto routing keeps the smart per-item workspace inference.
          const targetOrg =
            input.routingMode === "fixed" && input.routingTargets.length > 0
              ? input.routingTargets[0]
              : fallbackOrg
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
      metadata: { source: input.source, emails_total: emails.length, items_found: found },
    });

    // Auto-route this connection's pending items per preference, then look for
    // a new-section suggestion across the user's items.
    await autoRoutePendingItems(input.userId, input.connectionId);
    if (input.organizationId) {
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
    await markConnectionError(input.connectionId, "Scan failed");
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
