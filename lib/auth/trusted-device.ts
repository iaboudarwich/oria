import "server-only";

import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/data/audit-log";

/**
 * Trusted devices (Round 16.7). After a user passes the second factor they can
 * "remember this device": we store a random secret in an httpOnly cookie and
 * its SHA-256 hash in `trusted_devices`. On future sign-ins, a matching,
 * non-expired, non-revoked row lets them skip the second-factor step on THAT
 * device. Trust expires, and is revocable from Settings. The DB never sees the
 * secret, only its hash.
 */

export const TRUSTED_DEVICE_COOKIE = "oria_td";
export const TRUST_DAYS = 90;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Pure, friendly device label from a user-agent string ("Chrome on Mac"). */
export function deviceLabelFromUA(ua: string | null | undefined): string {
  const s = ua ?? "";
  const browser = /\bEdg\//.test(s)
    ? "Edge"
    : /\bOPR\//.test(s)
      ? "Opera"
      : /\bFirefox\//.test(s)
        ? "Firefox"
        : /\bChrome\//.test(s) && !/Chromium/.test(s)
          ? "Chrome"
          : /\bSafari\//.test(s)
            ? "Safari"
            : "Browser";
  const os = /iPhone|iPad|iPod/.test(s)
    ? "iOS"
    : /Android/.test(s)
      ? "Android"
      : /Mac OS X|Macintosh/.test(s)
        ? "Mac"
        : /Windows/.test(s)
          ? "Windows"
          : /Linux/.test(s)
            ? "Linux"
            : "device";
  return `${browser} on ${os}`;
}

async function currentUA(): Promise<string | null> {
  try {
    return (await headers()).get("user-agent");
  } catch {
    return null;
  }
}

/**
 * Mark the current device trusted for this user. Called after the second
 * factor passes AND the user opted in. Never throws (sign-in must not break).
 */
export async function trustThisDevice(userId: string): Promise<void> {
  try {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const label = deviceLabelFromUA(await currentUA());
    const expiresAt = new Date(Date.now() + TRUST_DAYS * 86_400_000).toISOString();

    const admin = createAdminClient();
    const { data } = await admin
      .from("trusted_devices")
      .insert({ user_id: userId, token_hash: tokenHash, label, expires_at: expiresAt })
      .select("id")
      .single();

    const jar = await cookies();
    jar.set({
      name: TRUSTED_DEVICE_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: TRUST_DAYS * 86_400,
    });

    await logAuditEvent({
      userId,
      action: "device.trusted",
      resourceType: "trusted_device",
      resourceId: (data as { id: string } | null)?.id ?? null,
      metadata: { label },
    });
  } catch {
    // Trust is a convenience; never let it break the sign-in.
  }
}

/**
 * Is the current device a valid trusted device for this user? Checks the cookie
 * secret against a non-expired, non-revoked row. Best-effort touches
 * last_used_at. Never throws (a failure just means "challenge them").
 */
export async function isTrustedDevice(userId: string): Promise<boolean> {
  try {
    const jar = await cookies();
    const token = jar.get(TRUSTED_DEVICE_COOKIE)?.value;
    if (!token) return false;
    const admin = createAdminClient();
    const { data } = await admin
      .from("trusted_devices")
      .select("id, expires_at")
      .eq("user_id", userId)
      .eq("token_hash", hashToken(token))
      .is("revoked_at", null)
      .maybeSingle();
    if (!data) return false;
    if (new Date((data as { expires_at: string }).expires_at).getTime() <= Date.now()) {
      return false;
    }
    void admin
      .from("trusted_devices")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", (data as { id: string }).id);
    return true;
  } catch {
    return false;
  }
}

export type TrustedDeviceRow = {
  id: string;
  label: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  current: boolean;
};

/** List the signed-in user's active (non-revoked, non-expired) trusted devices. */
export async function listTrustedDevices(): Promise<TrustedDeviceRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("trusted_devices")
    .select("id, label, token_hash, created_at, last_used_at, expires_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("last_used_at", { ascending: false });

  const jar = await cookies();
  const token = jar.get(TRUSTED_DEVICE_COOKIE)?.value;
  const currentHash = token ? hashToken(token) : null;
  return (
    (data ?? []) as Array<{
      id: string;
      label: string | null;
      token_hash: string;
      created_at: string;
      last_used_at: string;
      expires_at: string;
    }>
  ).map((d) => ({
    id: d.id,
    label: d.label,
    created_at: d.created_at,
    last_used_at: d.last_used_at,
    expires_at: d.expires_at,
    current: !!currentHash && d.token_hash === currentHash,
  }));
}
