import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/security/token-crypto";
import { revokeGoogleToken } from "./oauth";
import type { GoogleTokenResponse } from "./oauth";

export type CloudService = "calendar" | "drive";
export type CloudConnectionStatus = "active" | "paused" | "error" | "revoked";

/** Display-safe summary. NEVER carries token material. */
export type CloudConnectionSummary = {
  id: string;
  service: CloudService;
  accountEmail: string;
  status: CloudConnectionStatus;
  routingMode: "auto" | "fixed";
  routingTargetOrgIds: string[];
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  service: CloudService;
  account_email: string;
  status: CloudConnectionStatus;
  routing_mode: "auto" | "fixed";
  routing_target_org_ids: string[] | null;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
};

function toSummary(r: Row): CloudConnectionSummary {
  return {
    id: r.id,
    service: r.service,
    accountEmail: r.account_email,
    status: r.status,
    routingMode: r.routing_mode === "fixed" ? "fixed" : "auto",
    routingTargetOrgIds: r.routing_target_org_ids ?? [],
    lastSyncAt: r.last_sync_at,
    lastError: r.last_error,
    createdAt: r.created_at,
  };
}

const SUMMARY_COLS =
  "id, service, account_email, status, routing_mode, routing_target_org_ids, last_sync_at, last_error, created_at";

/** All of the user's cloud connections (RLS-scoped), oldest first. */
export async function listCloudConnections(
  userId: string,
): Promise<CloudConnectionSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cloud_connections")
    .select(SUMMARY_COLS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return ((data as Row[]) ?? []).map(toSummary);
}

/** Connections for one service (e.g. all Drive connections). */
export async function listCloudConnectionsByService(
  userId: string,
  service: CloudService,
): Promise<CloudConnectionSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cloud_connections")
    .select(SUMMARY_COLS)
    .eq("user_id", userId)
    .eq("service", service)
    .order("created_at", { ascending: true });
  return ((data as Row[]) ?? []).map(toSummary);
}

/** Create or refresh a cloud connection with freshly-issued tokens (encrypted). */
export async function upsertCloudConnection(input: {
  userId: string;
  service: CloudService;
  accountEmail: string;
  tokens: GoogleTokenResponse;
  existingRefreshToken?: string | null;
}): Promise<{ id: string; wasNew: boolean } | null> {
  const admin = createAdminClient();

  // A re-grant may omit the refresh token; keep the one we already stored.
  const { data: existing } = await admin
    .from("cloud_connections")
    .select("id, encrypted_refresh_token")
    .eq("user_id", input.userId)
    .eq("provider", "google")
    .eq("service", input.service)
    .eq("account_email", input.accountEmail)
    .maybeSingle();

  const refreshPlain =
    input.tokens.refreshToken ??
    (existing
      ? decryptToken((existing as { encrypted_refresh_token: string }).encrypted_refresh_token)
      : null);
  if (!refreshPlain) return null; // cannot operate without a refresh token

  const { data, error } = await admin
    .from("cloud_connections")
    .upsert(
      {
        user_id: input.userId,
        provider: "google",
        service: input.service,
        account_email: input.accountEmail,
        encrypted_access_token: encryptToken(input.tokens.accessToken),
        encrypted_refresh_token: encryptToken(refreshPlain),
        token_expires_at: input.tokens.expiresAt,
        scopes: input.tokens.scopes,
        status: "active",
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider,service,account_email" },
    )
    .select("id")
    .single();
  if (error || !data) return null;
  return { id: (data as { id: string }).id, wasNew: !existing };
}

/** Owner-scoped fetch of one connection summary (by id). */
export async function getCloudConnection(
  userId: string,
  connectionId: string,
): Promise<CloudConnectionSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cloud_connections")
    .select(SUMMARY_COLS)
    .eq("user_id", userId)
    .eq("id", connectionId)
    .maybeSingle();
  return data ? toSummary(data as Row) : null;
}

export async function markCloudConnectionSynced(connectionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("cloud_connections")
    .update({
      last_sync_at: new Date().toISOString(),
      status: "active",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
}

export async function markCloudConnectionError(
  connectionId: string,
  message: string,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("cloud_connections")
    .update({ status: "error", last_error: message, updated_at: new Date().toISOString() })
    .eq("id", connectionId);
}

/** Pause or resume one connection (by id, scoped to the owner). */
export async function setCloudConnectionStatus(
  userId: string,
  connectionId: string,
  status: CloudConnectionStatus,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("cloud_connections")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("user_id", userId);
}

/** Update one connection's routing (auto vs fixed + targets), owner-scoped. */
export async function updateCloudConnectionRouting(
  userId: string,
  connectionId: string,
  routingMode: "auto" | "fixed",
  routingTargetOrgIds: string[],
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("cloud_connections")
    .update({
      routing_mode: routingMode,
      routing_target_org_ids: routingMode === "fixed" ? routingTargetOrgIds : [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("user_id", userId);
}

/**
 * Disconnect one connection: best-effort revoke at Google, then delete the row.
 * cloud_files and calendar_events for this connection cascade-delete via their
 * FK (ON DELETE CASCADE). Owner-scoped. Returns false if not found.
 */
export async function deleteCloudConnection(
  userId: string,
  connectionId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cloud_connections")
    .select("id, encrypted_refresh_token")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return false;

  try {
    const refresh = decryptToken(
      (data as { encrypted_refresh_token: string }).encrypted_refresh_token,
    );
    await revokeGoogleToken(refresh);
  } catch {
    // Revoke is best-effort; proceed with local deletion regardless.
  }

  await admin
    .from("cloud_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", userId);
  return true;
}
