import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  buildMicrosoftAuthUrl,
  isMicrosoftOAuthConfigured,
  isMicrosoftService,
  scopesForService,
} from "@/lib/microsoft/oauth";
import { signMicrosoftState } from "@/lib/microsoft/oauth-state";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";
import { setConnectScopeCookie } from "@/lib/oauth/connect-scope";
import { diagOutlook } from "@/lib/microsoft/connect-diag";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Companion cookie carrying the signed state, for single-use enforcement when
 *  the flow stays on one host. The service no longer rides a cookie: it is
 *  baked into the signed state, so it survives a cross-host redirect. */
export const MS_STATE_COOKIE = "microsoft_oauth_state";

/**
 * GET /api/oauth/microsoft/connect?service=mail|onedrive|calendar[&email=...]
 *
 * Mints a signed, expiring, user-bound state (carrying the requested service)
 * in the OAuth `state` param so it survives the cross-host redirect back from
 * Microsoft, drops a companion cookie for single-use, and redirects to the
 * Microsoft consent screen with that service's minimal scopes. A config gap
 * lands the user back on Connections with a plain message and records the
 * precise reason (never a raw error).
 */
export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = new URL(request.url);
  const service = url.searchParams.get("service") ?? "";
  const loginHint = url.searchParams.get("email");

  if (!isMicrosoftService(service)) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=connections&notice=outlook_unavailable", base),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  const oauthOk = isMicrosoftOAuthConfigured();
  const cryptoOk = isTokenCryptoConfigured();
  if (!oauthOk || !cryptoOk) {
    await diagOutlook(
      !oauthOk ? "oauth_unconfigured" : "token_crypto_unconfigured",
      {
        ms_client_id: !!(process.env.MS_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID),
        ms_client_secret: !!(process.env.MS_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET),
        token_crypto: cryptoOk,
        service,
      },
      user.id,
    );
    return NextResponse.redirect(
      new URL("/dashboard/settings?tab=connections&notice=outlook_unavailable", base),
    );
  }

  const state = signMicrosoftState(user.id, service);
  const store = await cookies();
  store.set(MS_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  await setConnectScopeCookie(url.searchParams.get("org"));

  return NextResponse.redirect(
    buildMicrosoftAuthUrl({ state, scopes: scopesForService(service), loginHint }),
  );
}
