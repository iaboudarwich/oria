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

/**
 * All of the user's Gmail connections, oldest first (RLS-scoped). A user may
 * connect several Gmail accounts; each is managed independently.
 */
export async function listGmailConnections(
  userId: string,
): Promise<GmailConnectionSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_connections")
    .select("id, email_address, status, connected_at, last_synced_at, last_error")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .order("connected_at", { ascending: true });
  return ((data as Pick<
    Row,
    "id" | "email_address" | "status" | "connected_at" | "last_synced_at" | "last_error"
  >[]) ?? []).map((r) => ({
    id: r.id,
    email: r.email_address,
    status: r.status,
    connectedAt: r.connected_at,
    lastSyncedAt: r.last_synced_at,
    lastError: r.last_error,
  }));
}

/** True when the user already has a connection for this exact email address. */
export async function isGmailEmailConnected(
  userId: string,
  email: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .eq("email_address", email)
    .maybeSingle();
  return !!data;
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

/** Fetch one connection (by id) with decrypted tokens. Server-only. */
export async function getGmailConnectionTokens(
  connectionId: string,
): Promise<GmailConnectionTokens | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_connections")
    .select("*")
    .eq("id", connectionId)
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
 * Return a valid access token for one connection (by id), refreshing it (and
 * re-persisting the encrypted value) when it has expired or is within 2 min of
 * expiry. Returns null when the connection is missing or has no refresh token.
 * Server-only; the returned token is never logged or sent to the client.
 */
export async function getFreshGmailAccessToken(
  connectionId: string,
): Promise<{ connectionId: string; email: string; accessToken: string } | null> {
  const conn = await getGmailConnectionTokens(connectionId);
  if (!conn) return null;

  const expiresMs = conn.tokenExpiresAt
    ? new Date(conn.tokenExpiresAt).getTime()
    : 0;
  const stillValid = expiresMs - Date.now() > 120_000;
  if (stillValid) {
    return { connectionId: conn.id, email: conn.email, accessToken: conn.accessToken };
  }

  if (!conn.refreshToken) {
    await markConnectionError(conn.id, "Token expired and no refresh token");
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
    await markConnectionError(conn.id, "Failed to refresh access token");
    return null;
  }
}

/** Flag one connection (by id) as needing attention. No token material touched. */
export async function markConnectionError(
  connectionId: string,
  message: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("email_connections")
    .update({ status: "error", last_error: message })
    .eq("id", connectionId);
}

/** Stamp last_synced_at after a successful scan/sync. */
export async function markConnectionSynced(connectionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("email_connections")
    .update({ last_synced_at: new Date().toISOString(), status: "active", last_error: null })
    .eq("id", connectionId);
}

/** Suggested at first connect (default on): skip clearly confidential mail. */
export const DEFAULT_CONFIDENTIAL_KEYWORDS = [
  "confidential",
  "NDA",
  "attorney-client",
  "privileged",
  "private",
];

/** Seed the default confidential keywords on one connection, only if unset. */
export async function seedDefaultConfidentialKeywords(connectionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("email_connections")
    .update({ exclude_keywords: DEFAULT_CONFIDENTIAL_KEYWORDS })
    .eq("id", connectionId)
    .eq("exclude_keywords", "{}");
}

export type ConnectionFilterConfig = {
  excludeKeywords: string[];
  excludeSenders: string[];
  excludeWithAttachments: boolean;
  workspaceRouting: "personal" | "work" | "auto";
  // F2: 'auto' = smart per-item inference; 'fixed' = send to routingTargetOrgIds.
  routingMode: "auto" | "fixed";
  routingTargetOrgIds: string[];
};

/** Read one connection's confidentiality filters + workspace routing (by id). */
export async function getConnectionFilters(
  connectionId: string,
): Promise<ConnectionFilterConfig | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_connections")
    .select(
      "exclude_keywords, exclude_senders, exclude_with_attachments, workspace_routing, routing_mode, routing_target_org_ids",
    )
    .eq("id", connectionId)
    .maybeSingle();
  if (!data) return null;
  const r = data as {
    exclude_keywords: string[] | null;
    exclude_senders: string[] | null;
    exclude_with_attachments: boolean | null;
    workspace_routing: string | null;
    routing_mode: string | null;
    routing_target_org_ids: string[] | null;
  };
  const routing = r.workspace_routing;
  return {
    excludeKeywords: r.exclude_keywords ?? [],
    excludeSenders: r.exclude_senders ?? [],
    excludeWithAttachments: r.exclude_with_attachments ?? false,
    workspaceRouting: routing === "work" || routing === "auto" ? routing : "personal",
    routingMode: r.routing_mode === "fixed" ? "fixed" : "auto",
    routingTargetOrgIds: r.routing_target_org_ids ?? [],
  };
}

/** Update one connection's filters (by id, also scoped to the owner). */
export async function updateConnectionFilters(
  userId: string,
  connectionId: string,
  config: ConnectionFilterConfig,
): Promise<void> {
  const admin = createAdminClient();
  // When the user picks smart routing, keep workspace_routing on 'auto' so the
  // per-item inference runs; fixed mode ignores workspace_routing entirely.
  await admin
    .from("email_connections")
    .update({
      exclude_keywords: config.excludeKeywords,
      exclude_senders: config.excludeSenders,
      exclude_with_attachments: config.excludeWithAttachments,
      workspace_routing: config.routingMode === "auto" ? "auto" : config.workspaceRouting,
      routing_mode: config.routingMode,
      routing_target_org_ids: config.routingMode === "fixed" ? config.routingTargetOrgIds : [],
    })
    .eq("id", connectionId)
    .eq("user_id", userId);
}

/** The user's auto-routing preference (defaults to auto_confident). */
export async function getAutoRoutePreference(
  userId: string,
): Promise<"always_review" | "auto_confident" | "auto_all"> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("auto_route_preference")
    .eq("id", userId)
    .maybeSingle();
  const pref = (data as { auto_route_preference?: string } | null)?.auto_route_preference;
  if (pref === "always_review" || pref === "auto_all") return pref;
  return "auto_confident";
}

/** Pending + approved detected-item counts aggregated across all connections. */
export async function getGmailItemCounts(
  userId: string,
): Promise<{ pending: number; approved: number }> {
  const admin = createAdminClient();
  const [pendingRes, approvedRes] = await Promise.all([
    admin
      .from("email_detected_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending"),
    admin
      .from("email_detected_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "approved"),
  ]);
  return { pending: pendingRes.count ?? 0, approved: approvedRes.count ?? 0 };
}

/** Per-connection pending + approved counts (by connection_id). */
export async function getConnectionItemCounts(
  connectionId: string,
): Promise<{ pending: number; approved: number }> {
  const admin = createAdminClient();
  const [pendingRes, approvedRes] = await Promise.all([
    admin
      .from("email_detected_items")
      .select("id", { count: "exact", head: true })
      .eq("connection_id", connectionId)
      .eq("status", "pending"),
    admin
      .from("email_detected_items")
      .select("id", { count: "exact", head: true })
      .eq("connection_id", connectionId)
      .eq("status", "approved"),
  ]);
  return { pending: pendingRes.count ?? 0, approved: approvedRes.count ?? 0 };
}

/** Pause or resume one connection's sync (by id, scoped to the owner). */
export async function setGmailConnectionStatus(
  userId: string,
  connectionId: string,
  status: ConnectionStatus,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("email_connections")
    .update({ status })
    .eq("id", connectionId)
    .eq("user_id", userId);
}

/**
 * Delete the trackables and reminders created from ONE connection's detected
 * items. Call this BEFORE deleting the connection, because detected items
 * cascade-delete with the connection and we need their linkage first. Scoped to
 * the connection so other connections' items are untouched.
 */
export async function purgeGmailDerivedData(
  userId: string,
  connectionId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_detected_items")
    .select("resulting_trackable_id, resulting_reminder_id")
    .eq("user_id", userId)
    .eq("connection_id", connectionId)
    .eq("status", "approved");
  const rows = (data as
    | { resulting_trackable_id: string | null; resulting_reminder_id: string | null }[]
    | null) ?? [];

  const trackableIds = rows.map((r) => r.resulting_trackable_id).filter((x): x is string => !!x);
  const reminderIds = rows.map((r) => r.resulting_reminder_id).filter((x): x is string => !!x);

  if (reminderIds.length > 0) {
    await admin.from("reminders").delete().in("id", reminderIds);
  }
  if (trackableIds.length > 0) {
    await admin.from("trackables").delete().in("id", trackableIds);
  }
}

export async function deleteGmailConnection(userId: string, connectionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("email_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", userId);
}
