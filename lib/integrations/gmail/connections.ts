import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/security/token-crypto";
import { refreshAccessToken } from "./oauth";
import type { TokenResponse } from "./oauth";

export type ConnectionStatus = "active" | "paused" | "revoked" | "error";

/** Display-safe connection summary. NEVER carries token material. */
export type GmailConnectionSummary = {
  id: string;
  email: string;
  status: ConnectionStatus;
  connectedAt: string;
  lastSyncedAt: string | null;
  lastError: string | null;
};

/** Internal shape including decrypted tokens. Server-only; never returned to a
 *  client component or logged. */
export type GmailConnectionTokens = {
  id: string;
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  status: ConnectionStatus;
};

type Row = {
  id: string;
  user_id: string;
  email_address: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  connected_at: string;
  last_synced_at: string | null;
  status: ConnectionStatus;
  last_error: string | null;
};

/** The user's Gmail connection summary for the settings card (RLS-scoped). */
export async function getGmailConnection(
  userId: string,
): Promise<GmailConnectionSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_connections")
    .select("id, email_address, status, connected_at, last_synced_at, last_error")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();
  if (!data) return null;
  const r = data as Pick<
    Row,
    "id" | "email_address" | "status" | "connected_at" | "last_synced_at" | "last_error"
  >;
  return {
    id: r.id,
    email: r.email_address,
    status: r.status,
    connectedAt: r.connected_at,
    lastSyncedAt: r.last_synced_at,
    lastError: r.last_error,
  };
}

/** Create or update the connection with freshly-issued tokens (encrypted). */
export async function upsertGmailConnection(input: {
  userId: string;
  email: string;
  tokens: TokenResponse;
}): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_connections")
    .upsert(
      {
        user_id: input.userId,
        provider: "gmail",
        email_address: input.email,
        access_token_encrypted: encryptToken(input.tokens.accessToken),
        refresh_token_encrypted: input.tokens.refreshToken
          ? encryptToken(input.tokens.refreshToken)
          : null,
        token_expires_at: input.tokens.expiresAt,
        scopes: input.tokens.scopes,
        status: "active",
        last_error: null,
      },
      { onConflict: "user_id,provider,email_address" },
    )
    .select("id")
    .single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/** Fetch the connection with decrypted tokens. Server-only. */
export async function getGmailConnectionTokens(
  userId: string,
): Promise<GmailConnectionTokens | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();
  if (!data) return null;
  const r = data as Row;
  return {
    id: r.id,
    userId: r.user_id,
    email: r.email_address,
    accessToken: decryptToken(r.access_token_encrypted),
    refreshToken: r.refresh_token_encrypted
      ? decryptToken(r.refresh_token_encrypted)
      : null,
    tokenExpiresAt: r.token_expires_at,
    status: r.status,
  };
}

/**
 * Return a valid access token for the user's connection, refreshing it (and
 * re-persisting the encrypted value) when it has expired or is within 2 min of
 * expiry. Returns null when there is no connection or no refresh token.
 * Server-only; the returned token is never logged or sent to the client.
 */
export async function getFreshGmailAccessToken(
  userId: string,
): Promise<{ connectionId: string; email: string; accessToken: string } | null> {
  const conn = await getGmailConnectionTokens(userId);
  if (!conn) return null;

  const expiresMs = conn.tokenExpiresAt
    ? new Date(conn.tokenExpiresAt).getTime()
    : 0;
  const stillValid = expiresMs - Date.now() > 120_000;
  if (stillValid) {
    return { connectionId: conn.id, email: conn.email, accessToken: conn.accessToken };
  }

  if (!conn.refreshToken) {
    await markConnectionError(userId, "Token expired and no refresh token");
    return null;
  }

  try {
    const refreshed = await refreshAccessToken(conn.refreshToken);
    const admin = createAdminClient();
    await admin
      .from("email_connections")
      .update({
        access_token_encrypted: encryptToken(refreshed.accessToken),
        token_expires_at: refreshed.expiresAt,
        status: "active",
        last_error: null,
      })
      .eq("id", conn.id);
    return { connectionId: conn.id, email: conn.email, accessToken: refreshed.accessToken };
  } catch {
    await markConnectionError(userId, "Failed to refresh access token");
    return null;
  }
}

/** Flag the connection as needing attention (no token material touched). */
export async function markConnectionError(
  userId: string,
  message: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("email_connections")
    .update({ status: "error", last_error: message })
    .eq("user_id", userId)
    .eq("provider", "gmail");
}

/** Stamp last_synced_at after a successful scan/sync. */
export async function markConnectionSynced(connectionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("email_connections")
    .update({ last_synced_at: new Date().toISOString(), status: "active", last_error: null })
    .eq("id", connectionId);
}

export async function deleteGmailConnection(userId: string, connectionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("email_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", userId);
}
