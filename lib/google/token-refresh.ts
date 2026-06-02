import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/security/token-crypto";
import { refreshGoogleAccessToken } from "./oauth";

// Centralized fresh-token getter for cloud_connections (Calendar, Drive),
// mirroring getFreshGmailAccessToken. Refreshes (and re-persists the encrypted
// value) when the access token is expired or within 2 minutes of expiry.
// Server-only; the returned token is never logged or sent to the client.
//
// Self-contained DB access (does not import cloud-connections.ts) so the data
// layer can depend on this helper without a cycle.

export type FreshCloudToken = {
  connectionId: string;
  accountEmail: string;
  service: "calendar" | "drive";
  accessToken: string;
};

export async function getFreshCloudAccessToken(
  connectionId: string,
): Promise<FreshCloudToken | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cloud_connections")
    .select(
      "id, service, account_email, encrypted_access_token, encrypted_refresh_token, token_expires_at, status",
    )
    .eq("id", connectionId)
    .maybeSingle();
  if (!data) return null;
  const r = data as {
    id: string;
    service: "calendar" | "drive";
    account_email: string;
    encrypted_access_token: string;
    encrypted_refresh_token: string;
    token_expires_at: string;
  };

  const expiresMs = r.token_expires_at ? new Date(r.token_expires_at).getTime() : 0;
  const stillValid = expiresMs - Date.now() > 120_000;
  if (stillValid) {
    return {
      connectionId: r.id,
      accountEmail: r.account_email,
      service: r.service,
      accessToken: decryptToken(r.encrypted_access_token),
    };
  }

  try {
    const refreshToken = decryptToken(r.encrypted_refresh_token);
    const refreshed = await refreshGoogleAccessToken(refreshToken);
    await admin
      .from("cloud_connections")
      .update({
        encrypted_access_token: encryptToken(refreshed.accessToken),
        token_expires_at: refreshed.expiresAt,
        status: "active",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    return {
      connectionId: r.id,
      accountEmail: r.account_email,
      service: r.service,
      accessToken: refreshed.accessToken,
    };
  } catch {
    await admin
      .from("cloud_connections")
      .update({ status: "error", last_error: "Failed to refresh access token" })
      .eq("id", r.id);
    return null;
  }
}
