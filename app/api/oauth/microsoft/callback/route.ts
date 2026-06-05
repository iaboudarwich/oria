import "server-only";

import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/data/organizations";
import {
  exchangeCodeForMicrosoftTokens,
  fetchMicrosoftPrimaryEmail,
  cloudServiceFor,
} from "@/lib/microsoft/oauth";
import { verifyMicrosoftState } from "@/lib/microsoft/oauth-state";
import { diagOutlook, classifyMicrosoftError } from "@/lib/microsoft/connect-diag";
import { upsertOutlookConnection } from "@/lib/microsoft/connections";
import { startOutlookScan } from "@/lib/microsoft/outlook-scan";
import { syncUserOutlookCalendars } from "@/lib/microsoft/calendar";
import { upsertCloudConnection } from "@/lib/google/cloud-connections";
import { takeConnectScope } from "@/lib/oauth/connect-scope";
import { logAuditEvent } from "@/lib/data/audit-log";
import { MS_STATE_COOKIE } from "../connect/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function settingsRedirect(qs: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return NextResponse.redirect(new URL(`/dashboard/settings?tab=connections&${qs}`, base));
}

/** Pull the AADSTS code out of an error string for logging (not a secret). */
function aadstsOf(message: string): string | null {
  return message.match(/AADSTS\d+/i)?.[0] ?? null;
}

/**
 * GET /api/oauth/microsoft/callback
 * Verifies the SIGNED state (which carries the service), exchanges the code,
 * resolves the account email, and persists tokens: mail -> email_connections
 * (provider outlook), onedrive/calendar -> cloud_connections (provider
 * microsoft). Every failure shows the user plain copy; the precise failing step
 * is recorded server-side via diagOutlook, and a managed-tenant block becomes a
 * plain "needs an admin" message with a personal-account path.
 */
export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  const providerErrorDesc = url.searchParams.get("error_description");

  const store = await cookies();
  const cookieState = store.get(MS_STATE_COOKIE)?.value ?? null;
  store.delete(MS_STATE_COOKIE); // single-use: consume the companion cookie

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  // Microsoft returned an error to the callback (denied or, on a work/school
  // tenant, admin consent required). Classify WITHOUT surfacing the raw AADSTS
  // string; log the code for diagnostics; show the user a plain message.
  if (providerError) {
    const { adminConsent, aadsts } = classifyMicrosoftError(providerError, providerErrorDesc);
    await diagOutlook(
      adminConsent ? "admin_consent" : "provider_denied",
      { error: providerError, aadsts },
      user.id,
    );
    return settingsRedirect(adminConsent ? "notice=outlook_admin_consent" : "notice=outlook_failed");
  }

  // Verify the signed state: minted by us, for THIS user, unexpired, and (when
  // the flow stayed on one host) matching the single-use companion cookie. The
  // service is read FROM the signed state, so it survives a cross-host redirect.
  const verified = code && state ? verifyMicrosoftState(state, user.id) : null;
  const cookieOk = cookieState === null || cookieState === state;
  if (!code || !verified || !cookieOk) {
    await diagOutlook(
      "state_verify",
      { hasCode: !!code, signatureOk: !!verified, cookieOk, hadCookie: cookieState !== null },
      user.id,
    );
    return settingsRedirect("notice=outlook_failed");
  }
  const service = verified.service;

  // Step: authorization-code exchange.
  let tokens: Awaited<ReturnType<typeof exchangeCodeForMicrosoftTokens>>;
  try {
    tokens = await exchangeCodeForMicrosoftTokens(code);
  } catch (e) {
    const message = (e as Error).message;
    const { adminConsent } = classifyMicrosoftError(null, message);
    await diagOutlook("token_exchange", { aadsts: aadstsOf(message) }, user.id);
    return settingsRedirect(adminConsent ? "notice=outlook_admin_consent" : "notice=outlook_failed");
  }

  // Step: profile / email resolution.
  const email = await fetchMicrosoftPrimaryEmail(tokens.accessToken);
  if (!email) {
    await diagOutlook("profile_fetch", { service }, user.id);
    return settingsRedirect("notice=outlook_failed");
  }

  // Step: DB write (+ first sync). Mail -> email pipeline; calendar/onedrive ->
  // cloud connection (the same surfaces the Gmail/Google connectors feed).
  try {
    if (service === "mail") {
      const id = await upsertOutlookConnection({ userId: user.id, email, tokens });
      if (!id) {
        await diagOutlook("db_write", { service }, user.id);
        return settingsRedirect("notice=outlook_failed");
      }
      await logAuditEvent({
        userId: user.id,
        action: "email.connected",
        resourceType: "email_connection",
        resourceId: id,
        metadata: { source: "outlook", email },
      });
      const ctx = await getCurrentContext();
      const connectOrg = await takeConnectScope(user.id);
      const started = await startOutlookScan({
        userId: user.id,
        connectionId: id,
        organizationId: connectOrg ?? ctx?.organization.id ?? null,
      });
      if (started) after(started.process());
      return settingsRedirect("notice=outlook_connected");
    }

    await takeConnectScope(user.id); // cloud routing uses the per-connection controls
    const cloudService = cloudServiceFor(service);
    const result = await upsertCloudConnection({
      userId: user.id,
      provider: "microsoft",
      service: cloudService,
      accountEmail: email,
      tokens,
    });
    if (!result) {
      await diagOutlook("db_write", { service: cloudService }, user.id);
      return settingsRedirect("notice=outlook_failed");
    }
    await logAuditEvent({
      userId: user.id,
      action: "cloud.connected",
      resourceType: "cloud_connection",
      resourceId: result.id,
      metadata: { provider: "microsoft", service: cloudService, account_email: email },
    });
    if (cloudService === "outlook_calendar") {
      after(syncUserOutlookCalendars(user.id).then(() => undefined).catch(() => undefined));
    }
    const notice = service === "onedrive" ? "onedrive_connected" : "outlook_calendar_connected";
    return settingsRedirect(`notice=${notice}`);
  } catch (e) {
    await diagOutlook("db_write", { service, message: (e as Error).message.slice(0, 120) }, user.id);
    return settingsRedirect("notice=outlook_failed");
  }
}
