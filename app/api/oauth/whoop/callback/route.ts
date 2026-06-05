import "server-only";

import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, fetchProfile } from "@/lib/whoop/oauth";
import { upsertWhoopConnection } from "@/lib/whoop/connections";
import { syncWhoopConnection } from "@/lib/whoop/sync";
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
 * GET /api/oauth/whoop/callback
 * Validates state, exchanges the code for tokens, resolves the WHOOP profile,
 * stores the encrypted connection (one per user), audits, kicks off the first
 * sync in the background, and lands the user on the Health surface.
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
    const profile = await fetchProfile(tokens.accessToken);
    if (!profile) return settingsRedirect("save_failed");

    const id = await upsertWhoopConnection({
      userId: user.id,
      whoopUserId: profile.whoopUserId,
      email: profile.email,
      tokens,
    });
    if (!id) return settingsRedirect("save_failed");

    await logAuditEvent({
      userId: user.id,
      action: "whoop.connected",
      resourceType: "whoop_connection",
      resourceId: id,
      metadata: { whoop_user_id: profile.whoopUserId },
    });

    // First pull runs in the background so the user lands on Health right away;
    // data fills in within a few seconds.
    after(syncWhoopConnection(id));

    return NextResponse.redirect(new URL("/dashboard/health?connected=whoop", base));
  } catch {
    return settingsRedirect("exchange_failed");
  }
}
