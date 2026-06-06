import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/security/token-crypto";
import { refreshMicrosoftAccessToken } from "./oauth";

// Fresh-token getters for Microsoft connections. Unlike Google, Microsoft
// rotates the refresh token on every refresh, so we persist the new one when
// returned. Server-only; tokens are never logged or sent to the client.

export type FreshMicrosoftToken = {
  connectionId: string;
  accountEmail: string;
  accessToken: string;
};

/** Fresh access token for a Microsoft cloud_connections row (OneDrive / Calendar). */
export async function getFreshMicrosoftCloudToken(
  connectionId: string,
): Promise<FreshMicrosoftToken | null> {
  return refreshFromTable("cloud_connections", "account_email", connectionId);
}

/** Fresh access token for a Microsoft (Outlook) email_connections row. */
export async function getFreshOutlookMailToken(
  connectionId: string,
): Promise<FreshMicrosoftToken | null> {
  return refreshFromTable("email_connections", "email_address", connectionId);
}

async function refreshFromTable(
  table: "cloud_connections" | "email_connections",
  emailCol: "account_email" | "email_address",
  connectionId: string,
): Promise<FreshMicrosoftToken | null> {
  const admin = createAdminClient();
  // Column names differ between the two tables.
  const accessCol =
    table === "cloud_connections" ? "encrypted_access_token" : "access_token_encrypted";
  const refreshCol =
    table === "cloud_connections" ? "encrypted_refresh_token" : "refresh_token_encrypted";

  const { data } = await admin
    .from(table)
    .select(`id, ${emailCol}, ${accessCol}, ${refreshCol}, token_expires_at`)
    .eq("id", connectionId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, string | null>;

  const email = (row[emailCol] as string) ?? "";
  const expiresMs = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  const stillValid = expiresMs - Date.now() > 120_000;
  const encAccess = row[accessCol];
  const encRefresh = row[refreshCol];

  if (stillValid && encAccess) {
    return { connectionId, accountEmail: email, accessToken: decryptToken(encAccess) };
  }
  if (!encRefresh) return null;

  try {
    const refreshed = await refreshMicrosoftAccessToken(decryptToken(encRefresh));
    const update: Record<string, string | null> = {
      [accessCol]: encryptToken(refreshed.accessToken),
      token_expires_at: refreshed.expiresAt,
      status: "active",
      last_error: null,
    };
    if (refreshed.refreshToken) update[refreshCol] = encryptToken(refreshed.refreshToken);
    if (table === "cloud_connections") update.updated_at = new Date().toISOString();
    await admin.from(table).update(update).eq("id", connectionId);
    return { connectionId, accountEmail: email, accessToken: refreshed.accessToken };
  } catch {
    await admin
      .from(table)
      .update({ status: "error", last_error: "Failed to refresh token" })
      .eq("id", connectionId);
    return null;
  }
}
