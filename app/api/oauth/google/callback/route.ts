import "server-only";

import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeCodeForGoogleTokens,
  fetchGooglePrimaryEmail,
  isGoogleService,
} from "@/lib/google/oauth";
import { upsertCloudConnection } from "@/lib/google/cloud-connections";
import { syncUserCalendars } from "@/lib/google/calendar";
import { takeConnectScope } from "@/lib/oauth/connect-scope";
import { logAuditEvent } from "@/lib/data/audit-log";
import { GOOGLE_STATE_COOKIE, GOOGLE_SERVICE_COOKIE } from "../connect/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function settingsRedirect(qs: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return NextResponse.redirect(new URL(`/dashboard/settings?tab=connections&${qs}`, base));
}

/**
 * GET /api/oauth/google/callback
 * Validates state, reads the service cookie, exchanges the code for tokens,
 * resolves the account email, and stores the encrypted connection in
 * cloud_connections (keyed by user+provider+service+email). Audits and lands
 * the user back on the connections tab.
 */
export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expected = store.get(GOOGLE_STATE_COOKIE)?.value ?? null;
  const service = store.get(GOOGLE_SERVICE_COOKIE)?.value ?? "";
  store.delete(GOOGLE_STATE_COOKIE);
  store.delete(GOOGLE_SERVICE_COOKIE);

  if (url.searchParams.get("error")) return settingsRedirect("error=denied");
  if (!code || !state || !expected || state !== expected) {
    return settingsRedirect("error=bad_state");
  }
  if (!isGoogleService(service) || service === "mail") {
    return settingsRedirect("error=bad_service");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  try {
    const tokens = await exchangeCodeForGoogleTokens(code);
    const email = await fetchGooglePrimaryEmail(tokens.accessToken);
    if (!email) return settingsRedirect("error=no_email");

    await takeConnectScope(user.id); // consume the scope cookie (cloud routing is set via the existing per-connection controls)
    const result = await upsertCloudConnection({
      userId: user.id,
      service,
      accountEmail: email,
      tokens,
    });
    if (!result) return settingsRedirect("error=save_failed");

    await logAuditEvent({
      userId: user.id,
      action: "cloud.connected",
      resourceType: "cloud_connection",
      resourceId: result.id,
      metadata: { provider: "google", service, account_email: email },
    });

    // Calendar: kick off the first sync in the background so events appear
    // without waiting for the hourly cron. Drive waits for the user to pick.
    if (service === "calendar") {
      after(
        syncUserCalendars(user.id)
          .then(() => undefined)
          .catch(() => undefined),
      );
    }

    const notice = service === "drive" ? "drive_connected" : "calendar_connected";
    return settingsRedirect(`notice=${notice}`);
  } catch {
    return settingsRedirect("error=exchange_failed");
  }
}
