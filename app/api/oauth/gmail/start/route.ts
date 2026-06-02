import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl, isGmailOAuthConfigured } from "@/lib/integrations/gmail/oauth";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const STATE_COOKIE = "gmail_oauth_state";
export const SKIP_CONFIDENTIAL_COOKIE = "gmail_skip_confidential_seed";

/**
 * GET /api/oauth/gmail/start
 * Generates a CSRF-resistant state, stores it in a short-lived httpOnly
 * cookie, and redirects to Google's consent screen. Requires a signed-in user.
 *
 * Query: confidential=0 means the user unchecked "skip confidential mail" in
 * the consent step, so we record an opt-out cookie the callback reads.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    );
  }

  if (!isGmailOAuthConfigured() || !isTokenCryptoConfigured()) {
    return NextResponse.redirect(
      new URL(
        "/dashboard/settings?tab=connections&error=not_configured",
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      ),
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

  // Record the opt-out so the callback knows not to seed confidential filters.
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };
  if (new URL(request.url).searchParams.get("confidential") === "0") {
    store.set(SKIP_CONFIDENTIAL_COOKIE, "1", cookieOpts);
  } else {
    store.delete(SKIP_CONFIDENTIAL_COOKIE);
  }

  return NextResponse.redirect(buildAuthUrl(state));
}
