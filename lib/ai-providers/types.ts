// Common types for the multi-provider AI abstraction. The conversation surfaces
// (Ask Oria, the work agent) route through this so a user's own Claude / ChatGPT
// / Gemini key can power them; infrastructure work stays pinned to Oria's
// Anthropic backend.

export type ProviderName = "anthropic" | "openai" | "gemini";

/** Oria's internal capability tiers, mapped to each provider's actual model. */
export type ProviderTier = "premium" | "fast";

/** Which AI role a call belongs to. Infrastructure always uses Oria's key. */
export type QueryType = "infrastructure" | "conversation";

export type Role = "system" | "user" | "assistant";

/** Text-only message. The conversation surfaces are all text in/out. */
export type Message = { role: Role; content: string };

export type TokenUsage = { input: number; output: number };

export type CompletionOptions = {
  tier: ProviderTier;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  stopSequences?: string[];
  /** Optional usage callback, used by the per-query audit (F3). */
  onUsage?: (usage: { tokens: TokenUsage; model: string; provider: ProviderName }) => void;
};

export type CompletionResult = {
  content: string;
  tokensUsed: TokenUsage;
  model: string;
  provider: ProviderName;
};

export type ConnectionStatus = "active" | "invalid" | "rate_limited" | "out_of_credits";

export type ValidationResult = {
  valid: boolean;
  status: ConnectionStatus;
  error?: string;
  model?: string;
};

/** Every provider adapter implements this. Constructed with a concrete key. */
export interface ProviderAdapter {
  readonly provider: ProviderName;
  /** Non-streaming completion. */
  complete(messages: Message[], options: CompletionOptions): Promise<CompletionResult>;
  /** Streaming completion: yields text deltas. Calls options.onUsage at the end. */
  streamComplete(messages: Message[], options: CompletionOptions): AsyncGenerator<string, void, unknown>;
  /** Embed one string. Note: dimensions differ per provider; Oria's 384-dim
   *  store is fed by the sidecar, so this is only for provider-native use. */
  embed(text: string): Promise<number[]>;
  /** Validate this adapter's key with a tiny live call. */
  validateKey(): Promise<ValidationResult>;
}
