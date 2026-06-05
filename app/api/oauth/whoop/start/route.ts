import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl, isWhoopOAuthConfigured } from "@/lib/whoop/oauth";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const STATE_COOKIE = "whoop_oauth_state";

/**
 * GET /api/oauth/whoop/start
 * Generates a CSRF-resistant state, stores it in a short-lived httpOnly
 * cookie, and redirects to WHOOP's consent screen. Requires a signed-in user.
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
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=connections&error=not_configured", base),
    );
  }

  const state = randomBytes(24).toString("hex");
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
