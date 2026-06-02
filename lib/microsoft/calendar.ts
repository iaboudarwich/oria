import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { ingestCalendarEvents } from "@/lib/google/calendar";
import { listCloudConnectionsByService } from "@/lib/google/cloud-connections";
import { getFreshMicrosoftCloudToken } from "./token-refresh";
import { outlookCalendarSync } from "./sidecar";

/** Sync one Outlook calendar connection: pull, classify, route, upsert. */
export async function syncOutlookCalendarConnection(input: {
  userId: string;
  connectionId: string;
  routingMode: "auto" | "fixed";
  routingTargetOrgIds: string[];
  accountEmail: string;
}): Promise<number> {
  const token = await getFreshMicrosoftCloudToken(input.connectionId);
  if (!token) return 0;
  const events = await outlookCalendarSync(token.accessToken, 30, 90);
  return ingestCalendarEvents({ ...input, events });
}

/** Sync every active Outlook calendar connection (cron entry). */
export async function syncAllOutlookCalendars(): Promise<{ connections: number; events: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cloud_connections")
    .select("id, user_id, account_email, routing_mode, routing_target_org_ids")
    .eq("provider", "microsoft")
    .eq("service", "outlook_calendar")
    .eq("status", "active");

  const conns = (data as Array<{
    id: string;
    user_id: string;
    account_email: string;
    routing_mode: "auto" | "fixed";
    routing_target_org_ids: string[] | null;
  }>) ?? [];

  let events = 0;
  for (const c of conns) {
    try {
      events += await syncOutlookCalendarConnection({
        userId: c.user_id,
        connectionId: c.id,
        routingMode: c.routing_mode === "fixed" ? "fixed" : "auto",
        routingTargetOrgIds: c.routing_target_org_ids ?? [],
        accountEmail: c.account_email,
      });
    } catch {
      // One connection failing must not abort the rest.
    }
  }
  return { connections: conns.length, events };
}

/** Sync all of one user's Outlook calendars (used on first connect). */
export async function syncUserOutlookCalendars(userId: string): Promise<number> {
  const conns = await listCloudConnectionsByService(userId, "outlook_calendar");
  let events = 0;
  for (const c of conns) {
    if (c.status !== "active") continue;
    events += await syncOutlookCalendarConnection({
      userId,
      connectionId: c.id,
      routingMode: c.routingMode,
      routingTargetOrgIds: c.routingTargetOrgIds,
      accountEmail: c.accountEmail,
    });
  }
  return events;
}
