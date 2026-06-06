import "server-only";

import { NextResponse, after } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, fetchProfile, redirectUri } from "@/lib/whoop/oauth";
import { verifyWhoopState } from "@/lib/whoop/oauth-state";
import { upsertWhoopConnection } from "@/lib/whoop/connections";
import { syncWhoopConnection } from "@/lib/whoop/sync";
import { logAuditEvent } from "@/lib/data/audit-log";
import { recordSystemEvent } from "@/lib/data/system-events";
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
 * Server-side diagnostic for a failed connect: records the precise failing step
 * + reason to the operator system log AND the server console (Sentry/Vercel),
 * NEVER to the user (they always see the plain "couldn't connect" copy). Carries
 * no secret: token-exchange/profile bodies are WHOOP's RESPONSE only.
 */
async function diag(step: string, context: Record<string, unknown>): Promise<void> {
  console.error("[whoop-connect-failed]", step, context);
  await recordSystemEvent({
    kind: "whoop.connect_failed",
    severity: "warn",
    message: `WHOOP connect failed at: ${step}`,
    context: { step, ...context },
  });
}

/**
 * GET /api/oauth/whoop/callback
 * Verifies the signed state, exchanges the code for tokens, reads the WHOOP
 * profile, stores the encrypted connection, audits, kicks off the first sync,
 * and lands the user on Health. Every failure shows the user the same plain
 * message; the precise failing step is logged server-side via diag().
 */
export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  const store = await cookies();
  const cookieState = store.get(STATE_COOKIE)?.value ?? null;
  store.delete(STATE_COOKIE); // single-use: consume the companion cookie

  if (providerError) {
    await diag("provider_denied", { providerError });
    return healthRedirect("error");
  }
  if (!code || !state) {
    await diag("missing_code_or_state", { hasCode: !!code, hasState: !!state });
    return healthRedirect("error");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  // CSRF: the state must be one we signed for THIS user and unexpired. When the
  // companion cookie is present (same-host flow) it must also match (single use);
  // when absent (the flow began on another host) the signed token alone is
  // trusted.
  const signatureOk = verifyWhoopState(state, user.id);
  const cookieOk = cookieState === null || cookieState === state;
  if (!signatureOk || !cookieOk) {
    await diag("state_invalid", { signatureOk, cookieOk, hadCookie: cookieState !== null });
    return healthRedirect("error");
  }

  // Step: authorization-code exchange. The redirect_uri here is the same
  // canonical redirectUri() used to build the authorize URL; log it so a
  // redirect_uri_mismatch is obvious.
  const exchange = await exchangeCodeForTokens(code);
  if (!exchange.ok) {
    await diag("token_exchange", {
      status: exchange.status,
      body: exchange.body,
      redirect_uri: redirectUri(),
    });
    return healthRedirect("error");
  }

  // Step: profile / scope fetch.
  const profileRes = await fetchProfile(exchange.tokens.accessToken);
  if (!profileRes.ok) {
    await diag("profile_fetch", { status: profileRes.status, body: profileRes.body });
    return healthRedirect("error");
  }

  // Step: DB write.
  let id: string | null = null;
  try {
    id = await upsertWhoopConnection({
      userId: user.id,
      whoopUserId: profileRes.profile.whoopUserId,
      email: profileRes.profile.email,
      tokens: exchange.tokens,
    });
  } catch (e) {
    await diag("db_write", { message: (e as Error).message });
    return healthRedirect("error");
  }
  if (!id) {
    await diag("db_write", { reason: "upsert returned no id" });
    return healthRedirect("error");
  }

  await logAuditEvent({
    userId: user.id,
    action: "whoop.connected",
    resourceType: "whoop_connection",
    resourceId: id,
    metadata: { whoop_user_id: profileRes.profile.whoopUserId },
  });

  // First pull runs in the background so the user lands on Health right away.
  after(syncWhoopConnection(id));

  return healthRedirect("connected");
}
