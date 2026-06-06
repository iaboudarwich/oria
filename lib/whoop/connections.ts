import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/security/token-crypto";
import { refreshAccessToken, revokeAccess } from "./oauth";
import type { WhoopTokenResponse } from "./oauth";

export type ConnectionStatus = "active" | "paused" | "revoked" | "error";

/** Display-safe summary. NEVER carries token material. */
export type WhoopConnectionSummary = {
  id: string;
  whoopUserId: string;
  email: string | null;
  status: ConnectionStatus;
  connectedAt: string;
  lastSyncedAt: string | null;
  lastError: string | null;
};

/** Internal shape including decrypted tokens. Server-only; never returned to a
 *  client component or logged. */
export type WhoopConnectionTokens = {
  id: string;
  userId: string;
  whoopUserId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  status: ConnectionStatus;
};

type Row = {
  id: string;
  user_id: string;
  whoop_user_id: string;
  email: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  connected_at: string;
  last_synced_at: string | null;
  status: ConnectionStatus;
  last_error: string | null;
};

/** The user's WHOOP connection(s), oldest first (RLS-scoped). A user has at
 *  most one (unique on user_id), but the list shape matches the other
 *  connectors so the Connections hub treats them all the same. */
export async function listWhoopConnections(userId: string): Promise<WhoopConnectionSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whoop_connections")
    .select("id, whoop_user_id, email, status, connected_at, last_synced_at, last_error")
    .eq("user_id", userId)
    .order("connected_at", { ascending: true });
  return (
    (data as Pick<
      Row,
      "id" | "whoop_user_id" | "email" | "status" | "connected_at" | "last_synced_at" | "last_error"
    >[]) ?? []
  ).map((r) => ({
    id: r.id,
    whoopUserId: r.whoop_user_id,
    email: r.email,
    status: r.status,
    connectedAt: r.connected_at,
    lastSyncedAt: r.last_synced_at,
    lastError: r.last_error,
  }));
}

/** Create or update the connection (one per user) with fresh tokens. */
export async function upsertWhoopConnection(input: {
  userId: string;
  whoopUserId: string;
  email: string | null;
  tokens: WhoopTokenResponse;
}): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("whoop_connections")
    .upsert(
      {
        user_id: input.userId,
        whoop_user_id: input.whoopUserId,
        email: input.email,
        access_token_encrypted: encryptToken(input.tokens.accessToken),
        refresh_token_encrypted: input.tokens.refreshToken
          ? encryptToken(input.tokens.refreshToken)
          : null,
        token_expires_at: input.tokens.expiresAt,
        scopes: input.tokens.scopes,
        status: "active",
        last_error: null,
      },
      { onConflict: "user_id" },
    )
    .select("id")
    .single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/** Fetch one connection (by id) with decrypted tokens. Server-only. */
export async function getWhoopConnectionTokens(
  connectionId: string,
): Promise<WhoopConnectionTokens | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("whoop_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (!data) return null;
  const r = data as Row;
  return {
    id: r.id,
    userId: r.user_id,
    whoopUserId: r.whoop_user_id,
    accessToken: decryptToken(r.access_token_encrypted),
    refreshToken: r.refresh_token_encrypted ? decryptToken(r.refresh_token_encrypted) : null,
    tokenExpiresAt: r.token_expires_at,
    status: r.status,
  };
}

/**
 * Return a valid access token for one connection, refreshing it (and
 * re-persisting BOTH the new access token AND the rotated refresh token) when
 * it has expired or is within 2 min of expiry. WHOOP invalidates the old
 * refresh token on each refresh, so we always write the new one back. Returns
 * null when the connection is missing or has no refresh token.
 */
export async function getFreshWhoopAccessToken(
  connectionId: string,
): Promise<{ connectionId: string; userId: string; accessToken: string } | null> {
  const conn = await getWhoopConnectionTokens(connectionId);
  if (!conn) return null;

  const expiresMs = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
  const stillValid = expiresMs - Date.now() > 120_000;
  if (stillValid) {
    return { connectionId: conn.id, userId: conn.userId, accessToken: conn.accessToken };
  }

  if (!conn.refreshToken) {
    await markConnectionError(conn.id, "Reconnect WHOOP to keep it updated.");
    return null;
  }

  try {
    const refreshed = await refreshAccessToken(conn.refreshToken);
    const admin = createAdminClient();
    await admin
      .from("whoop_connections")
      .update({
        access_token_encrypted: encryptToken(refreshed.accessToken),
        // Persist the rotated refresh token; keep the prior one only if WHOOP
        // omitted a new one (it normally does not).
        refresh_token_encrypted: refreshed.refreshToken
          ? encryptToken(refreshed.refreshToken)
          : conn.refreshToken
            ? encryptToken(conn.refreshToken)
            : null,
        token_expires_at: refreshed.expiresAt,
        status: "active",
        last_error: null,
      })
      .eq("id", conn.id);
    return { connectionId: conn.id, userId: conn.userId, accessToken: refreshed.accessToken };
  } catch {
    await markConnectionError(conn.id, "Reconnect WHOOP to keep it updated.");
    return null;
  }
}

export async function markConnectionError(connectionId: string, message: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("whoop_connections")
    .update({ status: "error", last_error: message })
    .eq("id", connectionId);
}

export async function markConnectionSynced(connectionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("whoop_connections")
    .update({ last_synced_at: new Date().toISOString(), status: "active", last_error: null })
    .eq("id", connectionId);
}

/** Every active connection (admin scope) for the sync cron. */
export async function listActiveWhoopConnectionIds(): Promise<{ id: string; userId: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("whoop_connections")
    .select("id, user_id")
    .eq("status", "active");
  return ((data as { id: string; user_id: string }[]) ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
  }));
}

/**
 * Disconnect: revoke the grant at WHOOP (best effort, using a fresh token) and
 * delete the connection row. health_metrics already collected stays (it is the
 * user's own history); reconnecting resumes updates.
 */
export async function deleteWhoopConnection(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("whoop_connections")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  const id = (data as { id: string } | null)?.id;
  if (id) {
    const fresh = await getFreshWhoopAccessToken(id);
    if (fresh) await revokeAccess(fresh.accessToken);
  }
  await admin.from("whoop_connections").delete().eq("user_id", userId);
}
