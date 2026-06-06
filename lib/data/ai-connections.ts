import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken } from "@/lib/security/token-crypto";
import { buildAdapter } from "@/lib/ai-providers";
import type { ProviderName, ConnectionStatus } from "@/lib/ai-providers";

export type ReasoningMode = "auto" | "manual" | "always" | "never";

/** The user's Ask Oria reasoning preference (defaults to auto). */
export async function getReasoningMode(userId: string): Promise<ReasoningMode> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("reasoning_mode")
    .eq("id", userId)
    .maybeSingle();
  const m = (data as { reasoning_mode?: string } | null)?.reasoning_mode;
  return m === "manual" || m === "always" || m === "never" ? m : "auto";
}

/** Persist the user's reasoning preference. */
export async function setReasoningMode(userId: string, mode: ReasoningMode): Promise<void> {
  const admin = createAdminClient();
  await admin.from("profiles").update({ reasoning_mode: mode }).eq("id", userId);
}

/** Display-safe connection summary. NEVER carries the key. */
export type AiConnectionSummary = {
  provider: ProviderName;
  status: ConnectionStatus;
  lastValidatedAt: string | null;
  lastError: string | null;
};

/** One of the user's stored AI accounts (no key). RLS-scoped. */
export type AiConnection = AiConnectionSummary & {
  id: string;
  isActive: boolean;
  label: string | null;
};

/** All of a user's AI accounts (no keys), oldest first. */
export async function listAiConnections(userId: string): Promise<AiConnection[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_ai_connections")
    .select("id, provider, status, is_active, label, last_validated_at, last_error")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (
    (data ?? []) as Array<{
      id: string;
      provider: ProviderName;
      status: ConnectionStatus;
      is_active: boolean;
      label: string | null;
      last_validated_at: string | null;
      last_error: string | null;
    }>
  ).map((r) => ({
    id: r.id,
    provider: r.provider,
    status: r.status,
    isActive: r.is_active,
    label: r.label,
    lastValidatedAt: r.last_validated_at,
    lastError: r.last_error,
  }));
}

/** The user's ACTIVE AI connection (no key), or null. Back-compat summary used
 *  by the "powered by" surfaces. */
export async function getAiConnection(userId: string): Promise<AiConnectionSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_ai_connections")
    .select("provider, status, last_validated_at, last_error")
    .eq("user_id", userId)
    .eq("is_active", true)
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

/** Internal: the ACTIVE connection's provider + decrypted key, for routing.
 *  Server-only; the key is never logged or returned to the client. */
export async function getActiveAiConnectionKey(
  userId: string,
): Promise<{ provider: ProviderName; apiKey: string; status: ConnectionStatus } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_ai_connections")
    .select("provider, encrypted_api_key, status")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  const r = data as { provider: ProviderName; encrypted_api_key: string; status: ConnectionStatus };
  try {
    return { provider: r.provider, apiKey: decryptToken(r.encrypted_api_key), status: r.status };
  } catch {
    return null;
  }
}

/** Add or replace one provider's key for the user. The first account a user
 *  adds becomes active; later ones are stored but not made active until the
 *  user picks them. Encrypts the key. */
export async function addAiConnection(input: {
  userId: string;
  provider: ProviderName;
  apiKey: string;
}): Promise<{ ok: boolean; activated: boolean }> {
  const admin = createAdminClient();
  // Re-adding a provider keeps its existing is_active (column omitted from the
  // update set); a brand-new row inserts with the default (false).
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
    { onConflict: "user_id,provider" },
  );
  if (error) return { ok: false, activated: false };

  // Ensure exactly one active: if the user has none active, activate this one.
  const { data: actives } = await admin
    .from("user_ai_connections")
    .select("id")
    .eq("user_id", input.userId)
    .eq("is_active", true);
  if (!actives || actives.length === 0) {
    await admin
      .from("user_ai_connections")
      .update({ is_active: true })
      .eq("user_id", input.userId)
      .eq("provider", input.provider);
    return { ok: true, activated: true };
  }
  return { ok: true, activated: false };
}

/** Make one of the user's connections the active one (deactivating the rest). */
export async function setActiveAiConnection(
  userId: string,
  connectionId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("user_ai_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return false;
  // Deactivate first so the one-active partial unique index never conflicts.
  await admin
    .from("user_ai_connections")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);
  const { error } = await admin
    .from("user_ai_connections")
    .update({ is_active: true })
    .eq("id", connectionId)
    .eq("user_id", userId);
  return !error;
}

/** Remove one connection by id. If it was active, promote the newest remaining
 *  one so the user keeps a working active account. */
export async function removeAiConnection(
  userId: string,
  connectionId: string,
): Promise<{ ok: boolean; provider: ProviderName | null }> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("user_ai_connections")
    .select("provider, is_active")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return { ok: false, provider: null };
  const r = row as { provider: ProviderName; is_active: boolean };
  await admin.from("user_ai_connections").delete().eq("id", connectionId).eq("user_id", userId);
  if (r.is_active) {
    const { data: next } = await admin
      .from("user_ai_connections")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next) {
      await admin
        .from("user_ai_connections")
        .update({ is_active: true })
        .eq("id", (next as { id: string }).id);
    }
  }
  return { ok: true, provider: r.provider };
}

/** Re-validate every stored connection (weekly cron). Updates each by id. */
export async function revalidateAllAiConnections(): Promise<{ checked: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_ai_connections")
    .select("id, provider, encrypted_api_key");
  const rows =
    (data as { id: string; provider: ProviderName; encrypted_api_key: string }[] | null) ?? [];
  for (const r of rows) {
    try {
      const key = decryptToken(r.encrypted_api_key);
      const result = await buildAdapter(r.provider, key).validateKey();
      await admin
        .from("user_ai_connections")
        .update({
          status: result.status,
          last_error: result.valid ? null : (result.error ?? null),
          last_validated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id);
    } catch {
      // A single failure must not abort the batch.
    }
  }
  return { checked: rows.length };
}

/** Update the ACTIVE connection's status after a runtime failure or a
 *  per-user revalidation. Scoped to the active row so it never touches the
 *  user's other stored accounts. */
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
    .eq("user_id", userId)
    .eq("is_active", true);
}

export type PendingAiNotice = { provider: ProviderName; status: ConnectionStatus; at: string };

/** Queue the one-time fallback notice (set when a query falls back at runtime). */
export async function setPendingAiNotice(userId: string, notice: PendingAiNotice): Promise<void> {
  const admin = createAdminClient();
  await admin.from("profiles").update({ pending_ai_notice: notice }).eq("id", userId);
}

/** Read the pending fallback notice for the user, or null. */
export async function getPendingAiNotice(userId: string): Promise<PendingAiNotice | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("pending_ai_notice")
    .eq("id", userId)
    .maybeSingle();
  return (data as { pending_ai_notice: PendingAiNotice | null } | null)?.pending_ai_notice ?? null;
}

/** Clear the pending notice after the toast is shown. */
export async function clearPendingAiNotice(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("profiles").update({ pending_ai_notice: null }).eq("id", userId);
}
