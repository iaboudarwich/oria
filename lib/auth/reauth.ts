import "server-only";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Re-auth gate.
 *
 * Sensitive actions (disable 2FA, change password, reset/delete the
 * account, export data, revoke a session) require proof that the user
 * has reauthenticated within the last 5 minutes. We track that proof
 * as a short-lived signed cookie set by the MFA verify flow + the
 * password reauth endpoint, then check it at the top of any
 * sensitive Server Action.
 *
 * Cookie shape: a JSON-encoded payload of {userId, expiresAt} signed
 * by HMAC-SHA256 with a server-side secret. We rotate naturally on
 * every successful re-auth (the user_id changes if they switch
 * accounts; the expiresAt advances when they touch a sensitive
 * surface again). No DB hop; no shared state across instances.
 */

const COOKIE_NAME = "oria_reauth";
const WINDOW_MS = 5 * 60 * 1000;

function secret(): string {
  // ORIA_REAUTH_SECRET if set, otherwise fall back to the existing
  // service-role key so this works out of the box. The reauth secret
  // never leaves the server; it's used only to sign/verify a cookie.
  return (
    process.env.ORIA_REAUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "dev-reauth-secret-not-for-prod"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
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

/** Set the re-auth cookie for the active user. Call after a
 *  successful password verify, MFA verify, or backup-code consumption. */
export async function markReauthenticated(userId: string): Promise<void> {
  const payload = JSON.stringify({
    userId,
    expiresAt: Date.now() + WINDOW_MS,
  });
  const sig = sign(payload);
  const value = `${Buffer.from(payload).toString("base64url")}.${sig}`;
  const jar = await cookies();
  jar.set({
    name: COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WINDOW_MS / 1000,
  });
}

/** Returns true when the active user has reauthenticated in the
 *  window AND the cookie was signed by us (so a forged cookie can't
 *  bypass). */
export async function isReauthenticated(userId: string): Promise<boolean> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return false;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return false;
  const b64 = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(b64, "base64url").toString("utf8");
  } catch {
    return false;
  }
  if (!safeEqual(sig, sign(payload))) return false;
  let parsed: { userId?: string; expiresAt?: number };
  try {
    parsed = JSON.parse(payload);
  } catch {
    return false;
  }
  if (parsed.userId !== userId) return false;
  if (typeof parsed.expiresAt !== "number" || Date.now() > parsed.expiresAt) {
    return false;
  }
  return true;
}

/** Clear the cookie (called from sign-out paths so a re-auth window
 *  from a prior session can't carry over). */
export async function clearReauth(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}
