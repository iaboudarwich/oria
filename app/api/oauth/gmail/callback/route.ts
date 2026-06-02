import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeCodeForTokens,
  fetchPrimaryEmail,
} from "@/lib/integrations/gmail/oauth";
import { upsertGmailConnection } from "@/lib/integrations/gmail/connections";
import { logAuditEvent } from "@/lib/data/audit-log";
import { STATE_COOKIE } from "../start/route";

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
 * stores the encrypted connection, audits, and lands the user on the review
 * page to start the scan.
 */
export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value ?? null;
  store.delete(STATE_COOKIE);

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

    const id = await upsertGmailConnection({ userId: user.id, email, tokens });
    if (!id) return settingsRedirect("save_failed");

    await logAuditEvent({
      userId: user.id,
      action: "email.connected",
      resourceType: "email_connection",
      resourceId: id,
      metadata: { source: "gmail", email },
    });

    return NextResponse.redirect(new URL("/dashboard/connections/gmail/review", base));
  } catch {
    return settingsRedirect("exchange_failed");
  }
}
