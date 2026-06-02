import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeCodeForMicrosoftTokens,
  fetchMicrosoftPrimaryEmail,
  isMicrosoftService,
  cloudServiceFor,
} from "@/lib/microsoft/oauth";
import { upsertOutlookConnection } from "@/lib/microsoft/connections";
import { upsertCloudConnection } from "@/lib/google/cloud-connections";
import { logAuditEvent } from "@/lib/data/audit-log";
import { MS_STATE_COOKIE, MS_SERVICE_COOKIE } from "../connect/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function settingsRedirect(qs: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return NextResponse.redirect(new URL(`/dashboard/settings?tab=connections&${qs}`, base));
}

/**
 * GET /api/oauth/microsoft/callback
 * Validates state, reads the service cookie, exchanges the code, resolves the
 * account email, and persists tokens: mail -> email_connections (provider
 * outlook), onedrive/calendar -> cloud_connections (provider microsoft).
 */
export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expected = store.get(MS_STATE_COOKIE)?.value ?? null;
  const service = store.get(MS_SERVICE_COOKIE)?.value ?? "";
  store.delete(MS_STATE_COOKIE);
  store.delete(MS_SERVICE_COOKIE);

  if (url.searchParams.get("error")) return settingsRedirect("error=denied");
  if (!code || !state || !expected || state !== expected) {
    return settingsRedirect("error=bad_state");
  }
  if (!isMicrosoftService(service)) return settingsRedirect("error=bad_service");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  try {
    const tokens = await exchangeCodeForMicrosoftTokens(code);
    const email = await fetchMicrosoftPrimaryEmail(tokens.accessToken);
    if (!email) return settingsRedirect("error=no_email");

    if (service === "mail") {
      const id = await upsertOutlookConnection({ userId: user.id, email, tokens });
      if (!id) return settingsRedirect("error=save_failed");
      await logAuditEvent({
        userId: user.id,
        action: "email.connected",
        resourceType: "email_connection",
        resourceId: id,
        metadata: { source: "outlook", email },
      });
      return settingsRedirect("notice=outlook_connected");
    }

    const cloudService = cloudServiceFor(service);
    const result = await upsertCloudConnection({
      userId: user.id,
      provider: "microsoft",
      service: cloudService,
      accountEmail: email,
      tokens,
    });
    if (!result) return settingsRedirect("error=save_failed");
    await logAuditEvent({
      userId: user.id,
      action: "cloud.connected",
      resourceType: "cloud_connection",
      resourceId: result.id,
      metadata: { provider: "microsoft", service: cloudService, account_email: email },
    });
    const notice = service === "onedrive" ? "onedrive_connected" : "outlook_calendar_connected";
    return settingsRedirect(`notice=${notice}`);
  } catch {
    return settingsRedirect("error=exchange_failed");
  }
}
