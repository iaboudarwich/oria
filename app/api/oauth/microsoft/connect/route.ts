import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import {
  buildMicrosoftAuthUrl,
  isMicrosoftOAuthConfigured,
  isMicrosoftService,
  scopesForService,
} from "@/lib/microsoft/oauth";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const MS_STATE_COOKIE = "microsoft_oauth_state";
export const MS_SERVICE_COOKIE = "microsoft_oauth_service";

/**
 * GET /api/oauth/microsoft/connect?service=mail|onedrive|calendar[&email=...]
 *
 * Stores a CSRF state + the requested service in short-lived httpOnly cookies
 * and redirects to the Microsoft consent screen with that service's scopes.
 * Microsoft handles incremental consent; the optional email pre-selects the
 * account (login_hint).
 */
export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = new URL(request.url);
  const service = url.searchParams.get("service") ?? "";
  const loginHint = url.searchParams.get("email");

  if (!isMicrosoftService(service)) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=connections&error=bad_service", base),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  if (!isMicrosoftOAuthConfigured() || !isTokenCryptoConfigured()) {
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
    maxAge: 600,
  };
  store.set(MS_STATE_COOKIE, state, cookieOpts);
  store.set(MS_SERVICE_COOKIE, service, cookieOpts);

  return NextResponse.redirect(
    buildMicrosoftAuthUrl({ state, scopes: scopesForService(service), loginHint }),
  );
}
