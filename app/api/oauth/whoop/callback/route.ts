import "server-only";

import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, fetchProfile } from "@/lib/whoop/oauth";
import { verifyWhoopState } from "@/lib/whoop/oauth-state";
import { upsertWhoopConnection } from "@/lib/whoop/connections";
import { syncWhoopConnection } from "@/lib/whoop/sync";
import { logAuditEvent } from "@/lib/data/audit-log";
import { STATE_COOKIE } from "../start/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Land WHOOP outcomes on the Health surface with a plain flag (never a raw
 *  error code). The Health page maps `whoop=error` to plain copy. */
function healthRedirect(outcome: "connected" | "error"): NextResponse {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return NextResponse.redirect(new URL(`/dashboard/health?whoop=${outcome}`, base));
}

/**
 * GET /api/oauth/whoop/callback
 * Verifies the signed state (which survives the cross-host redirect because it
 * rides the `state` param, not a cookie), exchanges the code for tokens, stores
 * the encrypted connection, audits, kicks off the first sync, and lands the
 * user on Health. The companion cookie, when present (same-host flow), enforces
 * single use. Every failure shows a plain message.
 */
export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const cookieState = store.get(STATE_COOKIE)?.value ?? null;
  store.delete(STATE_COOKIE); // single-use: consume the companion cookie

  if (url.searchParams.get("error")) return healthRedirect("error");
  if (!code || !state) return healthRedirect("error");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  // CSRF: the state must be one we signed for THIS user and unexpired. When the
  // companion cookie is present (the flow stayed on one host), it must also
  // match, which enforces single use; when it is absent (the user began on a
  // different host than the callback), the signed token alone is trusted.
  const signatureOk = verifyWhoopState(state, user.id);
  const cookieOk = cookieState === null || cookieState === state;
  if (!signatureOk || !cookieOk) return healthRedirect("error");

  try {
    const tokens = await exchangeCodeForTokens(code);
    const profile = await fetchProfile(tokens.accessToken);
    if (!profile) return healthRedirect("error");

    const id = await upsertWhoopConnection({
      userId: user.id,
      whoopUserId: profile.whoopUserId,
      email: profile.email,
      tokens,
    });
    if (!id) return healthRedirect("error");

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

    return healthRedirect("connected");
  } catch {
    return healthRedirect("error");
  }
}
