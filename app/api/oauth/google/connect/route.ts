import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import {
  buildGoogleAuthUrl,
  isGoogleOAuthConfigured,
  isGoogleService,
  scopesForService,
} from "@/lib/google/oauth";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";
import { setConnectScopeCookie } from "@/lib/oauth/connect-scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GOOGLE_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_SERVICE_COOKIE = "google_oauth_service";

/**
 * GET /api/oauth/google/connect?service=calendar|drive|mail[&email=...]
 *
 * Unified Google connect entry. For mail it delegates to the existing Gmail
 * flow (which carries the confidentiality-seed + initial-scan behavior). For
 * calendar/drive it stores a CSRF state + the requested service in short-lived
 * httpOnly cookies and redirects to Google's consent screen with that service's
 * scopes. The optional email pre-selects the account (login_hint) so adding a
 * second service to an already-connected account skips the account chooser.
 */
export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = new URL(request.url);
  const service = url.searchParams.get("service") ?? "";
  const loginHint = url.searchParams.get("email");

  if (!isGoogleService(service)) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=connections&error=bad_service", base),
    );
  }

  // Mail keeps its dedicated flow untouched.
  if (service === "mail") {
    return NextResponse.redirect(new URL("/api/oauth/gmail/start", base));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  if (!isGoogleOAuthConfigured() || !isTokenCryptoConfigured()) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=connections&error=not_configured", base),
    );
  }

  const state = randomBytes(24).toString("hex");
  const store = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes
  };
  store.set(GOOGLE_STATE_COOKIE, state, cookieOpts);
  store.set(GOOGLE_SERVICE_COOKIE, service, cookieOpts);
  await setConnectScopeCookie(url.searchParams.get("org"));

  return NextResponse.redirect(
    buildGoogleAuthUrl({ state, scopes: scopesForService(service), loginHint }),
  );
}
