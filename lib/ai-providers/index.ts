import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/security/token-crypto";
import { AnthropicAdapter } from "./anthropic";
import { OpenAIAdapter } from "./openai";
import { GeminiAdapter } from "./gemini";
import type {
  CompletionOptions,
  CompletionResult,
  Message,
  ProviderAdapter,
  ProviderName,
  QueryType,
} from "./types";

export type { ProviderAdapter, ProviderName, QueryType, Message, CompletionOptions, CompletionResult } from "./types";
export type { ValidationResult, ConnectionStatus } from "./types";

/** Construct an adapter for a provider with a concrete key. */
export function buildAdapter(provider: ProviderName, apiKey: string): ProviderAdapter {
  switch (provider) {
    case "anthropic":
      return new AnthropicAdapter(apiKey);
    case "openai":
      return new OpenAIAdapter(apiKey);
    case "gemini":
      return new GeminiAdapter(apiKey);
  }
}

/** Oria's default adapter (Anthropic backend). Null when no key is configured. */
export function oriaDefaultAdapter(): ProviderAdapter | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new AnthropicAdapter(key) : null;
}

/**
 * Resolve the adapter for a conversation query: the user's connected provider
 * when its status is active, else null (caller falls back to Oria's default).
 * A non-active status (invalid / rate_limited / out_of_credits) silently falls
 * back. Reads user_ai_connections directly to avoid a data-layer import cycle.
 */
async function resolveUserConversationAdapter(userId: string): Promise<ProviderAdapter | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("user_ai_connections")
      .select("provider, encrypted_api_key, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    const r = data as { provider: ProviderName; encrypted_api_key: string; status: string };
    if (r.status !== "active") return null;
    return buildAdapter(r.provider, decryptToken(r.encrypted_api_key));
  } catch {
    return null;
  }
}

/**
 * The adapter a given call should use.
 *   infrastructure -> always Oria's Anthropic backend.
 *   conversation   -> the user's connected provider if active, else Oria's.
 * Returns null only when Oria has no key configured at all.
 */
export async function getProvider(
  userId: string,
  queryType: QueryType,
): Promise<ProviderAdapter | null> {
  if (queryType === "conversation") {
    const userAdapter = await resolveUserConversationAdapter(userId);
    if (userAdapter) return userAdapter;
  }
  return oriaDefaultAdapter();
}

/** Convenience: a non-streaming completion through the resolved provider. */
export async function complete(
  userId: string,
  queryType: QueryType,
  messages: Message[],
  options: CompletionOptions,
): Promise<CompletionResult | null> {
  const adapter = await getProvider(userId, queryType);
  if (!adapter) return null;
  return adapter.complete(messages, options);
}

/** Convenience: embed via the resolved provider (rarely used; see embed note). */
export async function embed(
  userId: string,
  queryType: QueryType,
  text: string,
): Promise<number[] | null> {
  const adapter = await getProvider(userId, queryType);
  if (!adapter) return null;
  return adapter.embed(text);
}
