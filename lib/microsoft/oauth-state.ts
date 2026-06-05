import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { MicrosoftService } from "./oauth";

/**
 * Signed OAuth `state` for the Microsoft (Graph) flow, same pattern proven on
 * WHOOP (lib/whoop/oauth-state.ts). The state carries a signed, expiring,
 * user-bound token AND the requested service IN THE PARAM, so it survives the
 * cross-host redirect that breaks a cookie-only check (the flow can begin on a
 * vercel.app alias but Microsoft returns to the canonical NEXT_PUBLIC_SITE_URL
 * host, where the host-only cookie is absent). The callback verifies the HMAC,
 * the expiry, and that the state was minted for THIS signed-in user; the start
 * route still sets a companion cookie for single-use when the flow stays on one
 * host. No secret is ever placed in the state.
 */

const WINDOW_MS = 10 * 60 * 1000;
const DOMAIN = "microsoft-oauth-state";

function secret(): string {
  return (
    process.env.ORIA_REAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-microsoft-state-secret-not-for-prod"
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

/** Mint a signed state binding the user + the requested service. */
export function signMicrosoftState(userId: string, service: MicrosoftService): string {
  const payload = JSON.stringify({
    u: userId,
    s: service,
    n: randomBytes(16).toString("hex"),
    e: Date.now() + WINDOW_MS,
  });
  const b64 = Buffer.from(payload).toString("base64url");
  return `${b64}.${sign(b64)}`;
}

/**
 * Verify a state was minted by us, for this user, and has not expired. Returns
 * the service carried in the state so the callback never relies on the cookie
 * for it. Returns null on any failure.
 */
export function verifyMicrosoftState(
  state: string | null,
  userId: string,
): { service: MicrosoftService } | null {
  if (!state) return null;
  const dot = state.lastIndexOf(".");
  if (dot < 0) return null;
  const b64 = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  if (!safeEqual(sig, sign(b64))) return null;
  let parsed: { u?: string; s?: string; e?: number };
  try {
    parsed = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (parsed.u !== userId) return null;
  if (typeof parsed.e !== "number" || Date.now() > parsed.e) return null;
  if (parsed.s !== "mail" && parsed.s !== "onedrive" && parsed.s !== "calendar") return null;
  return { service: parsed.s };
}
