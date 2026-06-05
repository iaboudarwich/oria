import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl, isWhoopOAuthConfigured } from "@/lib/whoop/oauth";
import { signWhoopState } from "@/lib/whoop/oauth-state";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const STATE_COOKIE = "whoop_oauth_state";

/**
 * GET /api/oauth/whoop/start
 * Mints a signed, expiring, user-bound state (carried in the OAuth `state`
 * param so it survives the cross-host redirect back from whoop.com), also drops
 * it in a short-lived httpOnly cookie for single-use enforcement when the flow
 * stays on one host, and redirects to WHOOP's consent screen. Requires a
 * signed-in user. On a config problem we land the user back on Health with a
 * plain message (never a raw error code).
 */
export async function GET() {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", base));
  }

  if (!isWhoopOAuthConfigured() || !isTokenCryptoConfigured()) {
    return NextResponse.redirect(new URL("/dashboard/health?whoop=error", base));
  }

  const state = signWhoopState(user.id);
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return NextResponse.redirect(buildAuthUrl(state));
}
