import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signed OAuth `state` for the WHOOP flow.
 *
 * WHY NOT JUST A COOKIE: the start route sets a host-only state cookie, but the
 * redirect_uri WHOOP returns to is the canonical NEXT_PUBLIC_SITE_URL host. When
 * the user begins the flow on any other host (a vercel.app alias, a preview
 * URL), the cookie set on that host is NOT present at the canonical callback, so
 * the cookie-only check failed with bad_state (confirmed by repro: bad_state
 * exactly when the cookie is absent at the callback). The cookie attributes were
 * already correct (SameSite=Lax, Path=/), identical to the working Google flow,
 * so the cookie was never the difference; the cross-host round trip was.
 *
 * The fix carries a signed, expiring, user-bound token in the `state` PARAM
 * itself, which survives the cross-host redirect because it is not a cookie. The
 * callback verifies the HMAC signature, the expiry, and that the state was
 * minted for THIS signed-in user. That is stronger CSRF protection than an
 * opaque random cookie (which only proves same-browser, not same-user): an
 * attacker cannot forge a state bound to the victim's id without the secret. The
 * start route still also sets the cookie, so when the flow stays on one host the
 * callback additionally enforces single use by consuming it.
 */

const WINDOW_MS = 10 * 60 * 1000;
const DOMAIN = "whoop-oauth-state";

function secret(): string {
  return (
    process.env.ORIA_REAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-whoop-state-secret-not-for-prod"
  );
}

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(`${DOMAIN}.${payloadB64}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** Mint a signed state for the given user. Single-use is enforced at the
 *  callback via the companion cookie when the flow stays on one host; the token
 *  always expires and is bound to the user. */
export function signWhoopState(userId: string): string {
  const payload = JSON.stringify({
    u: userId,
    n: randomBytes(16).toString("hex"),
    e: Date.now() + WINDOW_MS,
  });
  const b64 = Buffer.from(payload).toString("base64url");
  return `${b64}.${sign(b64)}`;
}

/** Verify a state value was minted by us, for this user, and has not expired. */
export function verifyWhoopState(state: string | null, userId: string): boolean {
  if (!state) return false;
  const dot = state.lastIndexOf(".");
  if (dot < 0) return false;
  const b64 = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  if (!safeEqual(sig, sign(b64))) return false;
  let parsed: { u?: string; e?: number };
  try {
    parsed = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (parsed.u !== userId) return false;
  if (typeof parsed.e !== "number" || Date.now() > parsed.e) return false;
  return true;
}
