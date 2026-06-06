import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sidecarAuthHeaders } from "@/lib/google/shared/sidecar-auth";
import { runEmailScan } from "@/lib/integrations/gmail/scan";
import type { ScannedEmail } from "@/lib/integrations/gmail/classify";
import type { WorkspaceRouting } from "@/lib/integrations/gmail/workspace";
import { getFreshOutlookMailToken } from "./token-refresh";

const SIDECAR_URL =
  process.env.PYTHON_EXTRACTION_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

type Filters = {
  excludeKeywords: string[];
  excludeSenders: string[];
  excludeWithAttachments: boolean;
};

/** Ask the sidecar to fetch + parse recent Outlook messages via Graph. */
async function fetchOutlookMessages(input: {
  accessToken: string;
  sinceIso: string | null;
  filters: Filters;
}): Promise<{ emails: ScannedEmail[]; skipped: number }> {
  const res = await fetch(`${SIDECAR_URL}/outlook/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...sidecarAuthHeaders("POST", "/outlook/scan") },
    body: JSON.stringify({
      access_token: input.accessToken,
      since_iso: input.sinceIso,
      max_messages: 150,
      exclude_keywords: input.filters.excludeKeywords,
      exclude_senders: input.filters.excludeSenders,
      exclude_with_attachments: input.filters.excludeWithAttachments,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`sidecar /outlook/scan HTTP ${res.status}`);
  const json = (await res.json()) as { emails: ScannedEmail[]; skipped?: number };
  return { emails: json.emails ?? [], skipped: json.skipped ?? 0 };
}

/**
 * Begin an Outlook scan: refresh the token, create a `running` job row, and
 * return a `process()` that fetches via the sidecar and runs the shared
 * classify/route/store pipeline (runEmailScan, source="outlook").
 */
export async function startOutlookScan(input: {
  userId: string;
  connectionId: string;
  organizationId: string | null;
  sinceIso?: string | null;
}): Promise<{ jobId: string; process: () => Promise<void> } | null> {
  const admin = createAdminClient();
  const token = await getFreshOutlookMailToken(input.connectionId);
  if (!token) return null;

  const { data: connRow } = await admin
    .from("email_connections")
    .select(
      "exclude_keywords, exclude_senders, exclude_with_attachments, workspace_routing, routing_mode, routing_target_org_ids",
    )
    .eq("id", input.connectionId)
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
  const filters: Filters = {
    excludeKeywords: conn.exclude_keywords ?? [],
    excludeSenders: conn.exclude_senders ?? [],
    excludeWithAttachments: conn.exclude_with_attachments ?? false,
  };

  const { data: jobRow } = await admin
    .from("email_scan_jobs")
    .insert({
      connection_id: input.connectionId,
      user_id: input.userId,
      timeframe_months: 6,
      status: "running",
    })
    .select("id")
    .single();
  const jobId = (jobRow as { id: string } | null)?.id;
  if (!jobId) return null;

  return {
    jobId,
    process: () =>
      runEmailScan({
        userId: input.userId,
        organizationId: input.organizationId,
        jobId,
        connectionId: input.connectionId,
        source: "outlook",
        workspaceRouting: conn.workspace_routing ?? "personal",
        routingMode: conn.routing_mode ?? "auto",
        routingTargets: conn.routing_target_org_ids ?? [],
        fetch: () =>
          fetchOutlookMessages({
            accessToken: token.accessToken,
            sinceIso: input.sinceIso ?? null,
            filters,
          }),
      }),
  };
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

export type OutlookSyncResult = { connections: number; rateLimited: number };

/** Ongoing hourly sync across every active Outlook connection. */
export async function syncAllOutlookConnections(): Promise<OutlookSyncResult> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_connections")
    .select("id, user_id, last_synced_at")
    .eq("provider", "outlook")
    .eq("status", "active");
  const conns =
    (data as { id: string; user_id: string; last_synced_at: string | null }[] | null) ?? [];

  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let skipped = 0;
  for (const conn of conns) {
    try {
      if (conn.last_synced_at && new Date(conn.last_synced_at).getTime() > oneHourAgo) {
        skipped += 1;
        continue;
      }
      const orgId = await primaryOrgId(conn.user_id);
      // One day of overlap so nothing slips between runs.
      const sinceIso = conn.last_synced_at
        ? new Date(new Date(conn.last_synced_at).getTime() - 24 * 60 * 60 * 1000).toISOString()
        : null;
      const started = await startOutlookScan({
        userId: conn.user_id,
        connectionId: conn.id,
        organizationId: orgId,
        sinceIso,
      });
      if (started) await started.process();
    } catch {
      // Errors are recorded on the connection inside the scan; keep going.
    }
  }
  return { connections: conns.length, rateLimited: skipped };
}
