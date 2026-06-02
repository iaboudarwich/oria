import type { ProviderName, ProviderTier } from "./types";

// Maps Oria's internal tiers to each provider's concrete model. Anthropic honors
// the existing env overrides so Oria's tuning (and the deployed model pins) carry
// over unchanged; OpenAI and Gemini use sensible defaults, overridable by env.

type TierModels = { premium: string; fast: string; embedding: string };

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v : undefined;
}

export function modelFor(provider: ProviderName, tier: ProviderTier): string {
  switch (provider) {
    case "anthropic":
      return tier === "premium"
        ? env("ANTHROPIC_EXTRACTION_MODEL") ?? env("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6"
        : env("ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001";
    case "openai":
      return tier === "premium"
        ? env("OPENAI_PREMIUM_MODEL") ?? "gpt-4o"
        : env("OPENAI_FAST_MODEL") ?? "gpt-4o-mini";
    case "gemini":
      return tier === "premium"
        ? env("GEMINI_PREMIUM_MODEL") ?? "gemini-1.5-pro"
        : env("GEMINI_FAST_MODEL") ?? "gemini-1.5-flash";
  }
}

export const EMBEDDING_MODEL: Record<ProviderName, string> = {
  // Anthropic has no embeddings API; Oria embeds via the sidecar (all-MiniLM,
  // 384-dim). The other two are provider-native and NOT used for Oria's store.
  anthropic: "sidecar-all-MiniLM-L6-v2",
  openai: "text-embedding-3-small",
  gemini: "text-embedding-004",
};

export const TIER_MODELS: Record<ProviderName, TierModels> = {
  anthropic: { premium: "claude-sonnet-4-6", fast: "claude-haiku-4-5-20251001", embedding: EMBEDDING_MODEL.anthropic },
  openai: { premium: "gpt-4o", fast: "gpt-4o-mini", embedding: EMBEDDING_MODEL.openai },
  gemini: { premium: "gemini-1.5-pro", fast: "gemini-1.5-flash", embedding: EMBEDDING_MODEL.gemini },
};
