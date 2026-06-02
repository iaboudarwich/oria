import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken } from "@/lib/security/token-crypto";
import type { MicrosoftTokenResponse } from "./oauth";

export type OutlookConnectionSummary = {
  id: string;
  email: string;
  status: "active" | "paused" | "revoked" | "error";
  connectedAt: string;
  lastSyncedAt: string | null;
  lastError: string | null;
};

/** All of the user's connected Outlook mailboxes (RLS-scoped). */
export async function listOutlookConnections(
  userId: string,
): Promise<OutlookConnectionSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_connections")
    .select("id, email_address, status, connected_at, last_synced_at, last_error")
    .eq("user_id", userId)
    .eq("provider", "outlook")
    .order("connected_at", { ascending: true });
  return ((data as Array<{
    id: string;
    email_address: string;
    status: OutlookConnectionSummary["status"];
    connected_at: string;
    last_synced_at: string | null;
    last_error: string | null;
  }>) ?? []).map((r) => ({
    id: r.id,
    email: r.email_address,
    status: r.status,
    connectedAt: r.connected_at,
    lastSyncedAt: r.last_synced_at,
    lastError: r.last_error,
  }));
}

export async function isOutlookEmailConnected(userId: string, email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "outlook")
    .eq("email_address", email)
    .maybeSingle();
  return !!data;
}

/** Create or refresh the Outlook mail connection (encrypted tokens). */
export async function upsertOutlookConnection(input: {
  userId: string;
  email: string;
  tokens: MicrosoftTokenResponse;
}): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_connections")
    .upsert(
      {
        user_id: input.userId,
        provider: "outlook",
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
