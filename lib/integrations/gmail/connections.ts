import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/security/token-crypto";
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

export async function deleteGmailConnection(userId: string, connectionId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("email_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", userId);
}
