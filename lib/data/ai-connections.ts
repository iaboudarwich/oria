import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/security/token-crypto";
import { buildAdapter } from "@/lib/ai-providers";
import type { ProviderName, ConnectionStatus } from "@/lib/ai-providers";

/** Display-safe connection summary. NEVER carries the key. */
export type AiConnectionSummary = {
  provider: ProviderName;
  status: ConnectionStatus;
  lastValidatedAt: string | null;
  lastError: string | null;
};

/** The user's AI connection (no key), or null. RLS-scoped. */
export async function getAiConnection(userId: string): Promise<AiConnectionSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_ai_connections")
    .select("provider, status, last_validated_at, last_error")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const r = data as {
    provider: ProviderName;
    status: ConnectionStatus;
    last_validated_at: string | null;
    last_error: string | null;
  };
  return {
    provider: r.provider,
    status: r.status,
    lastValidatedAt: r.last_validated_at,
    lastError: r.last_error,
  };
}

/** Internal: the active connection's provider + decrypted key, for routing.
 *  Server-only; the key is never logged or returned to the client. */
export async function getActiveAiConnectionKey(
  userId: string,
): Promise<{ provider: ProviderName; apiKey: string; status: ConnectionStatus } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_ai_connections")
    .select("provider, encrypted_api_key, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const r = data as { provider: ProviderName; encrypted_api_key: string; status: ConnectionStatus };
  try {
    return { provider: r.provider, apiKey: decryptToken(r.encrypted_api_key), status: r.status };
  } catch {
    return null;
  }
}

/** Create or replace the user's connection (one per user). Encrypts the key. */
export async function upsertAiConnection(input: {
  userId: string;
  provider: ProviderName;
  apiKey: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("user_ai_connections").upsert(
    {
      user_id: input.userId,
      provider: input.provider,
      encrypted_api_key: encryptToken(input.apiKey),
      status: "active",
      last_validated_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  return !error;
}

export async function deleteAiConnection(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("user_ai_connections").delete().eq("user_id", userId);
}

/** Re-validate every stored connection (weekly cron). Updates each status. */
export async function revalidateAllAiConnections(): Promise<{ checked: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_ai_connections")
    .select("user_id, provider, encrypted_api_key");
  const rows = (data as { user_id: string; provider: ProviderName; encrypted_api_key: string }[] | null) ?? [];
  for (const r of rows) {
    try {
      const key = decryptToken(r.encrypted_api_key);
      const result = await buildAdapter(r.provider, key).validateKey();
      await setAiConnectionStatus(r.user_id, result.status, result.valid ? null : result.error ?? null);
    } catch {
      // A single failure must not abort the batch.
    }
  }
  return { checked: rows.length };
}

/** Update the connection's status after a (re)validation or a runtime failure. */
export async function setAiConnectionStatus(
  userId: string,
  status: ConnectionStatus,
  lastError: string | null,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("user_ai_connections")
    .update({
      status,
      last_error: lastError,
      last_validated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}
