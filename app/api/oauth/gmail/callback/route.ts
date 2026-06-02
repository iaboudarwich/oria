import "server-only";

import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/data/organizations";
import {
  exchangeCodeForTokens,
  fetchPrimaryEmail,
} from "@/lib/integrations/gmail/oauth";
import {
  upsertGmailConnection,
  seedDefaultConfidentialKeywords,
  isGmailEmailConnected,
} from "@/lib/integrations/gmail/connections";
import { startGmailScan } from "@/lib/integrations/gmail/scan";
import { logAuditEvent } from "@/lib/data/audit-log";
import { STATE_COOKIE, SKIP_CONFIDENTIAL_COOKIE } from "../start/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function settingsRedirect(error: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return NextResponse.redirect(
    new URL(`/dashboard/settings?tab=connections&error=${error}`, base),
  );
}

/**
 * GET /api/oauth/gmail/callback
 * Validates state, exchanges the code for tokens, resolves the primary email,
 * stores the encrypted connection (keyed by email so a new account inserts a
 * new row and a reconnect updates the existing one), audits, and lands the user
 * on the review page. A user can connect several Gmail accounts.
 */
export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value ?? null;
  const skipConfidentialSeed = store.get(SKIP_CONFIDENTIAL_COOKIE)?.value === "1";
  store.delete(STATE_COOKIE);
  store.delete(SKIP_CONFIDENTIAL_COOKIE);

  if (url.searchParams.get("error")) return settingsRedirect("denied");
  if (!code || !state || !expected || state !== expected) {
    return settingsRedirect("bad_state");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  try {
    const tokens = await exchangeCodeForTokens(code);
    const email = await fetchPrimaryEmail(tokens.accessToken);
    if (!email) return settingsRedirect("no_email");

    // Was this email already connected? Reconnecting refreshes its tokens (fine)
    // but we tell the user rather than pretending a new account was added.
    const alreadyConnected = await isGmailEmailConnected(user.id, email);

    const id = await upsertGmailConnection({ userId: user.id, email, tokens });
    if (!id) return settingsRedirect("save_failed");

    if (alreadyConnected) {
      return NextResponse.redirect(
        new URL("/dashboard/settings?tab=connections&notice=already_connected", base),
      );
    }

    // First-connect default for THIS connection: skip confidential mail unless
    // the user opted out in the consent step.
    if (!skipConfidentialSeed) {
      await seedDefaultConfidentialKeywords(id);
    }

    await logAuditEvent({
      userId: user.id,
      action: "email.connected",
      resourceType: "email_connection",
      resourceId: id,
      metadata: { source: "gmail", email },
    });

    // Kick off the initial scan for this newly-connected account in the
    // background, so a second/third account starts scanning immediately even
    // though the review page already has items from the others.
    const ctx = await getCurrentContext();
    const started = await startGmailScan({
      userId: user.id,
      connectionId: id,
      organizationId: ctx?.organization.id ?? null,
      timeframeMonths: 6,
    });
    if (started) after(started.process);

    return NextResponse.redirect(new URL("/dashboard/connections/gmail/review", base));
  } catch {
    return settingsRedirect("exchange_failed");
  }
}
