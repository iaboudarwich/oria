// Common types for the multi-provider AI abstraction. The conversation surfaces
// (Ask Oria, the work agent) route through this so a user's own Claude / ChatGPT
// / Gemini key can power them; infrastructure work stays pinned to Oria's
// Anthropic backend. The abstraction also carries tool-use and vision so OpenAI
// reaches parity with Anthropic on the capabilities Oria's AI calls use.

export type ProviderName = "anthropic" | "openai" | "gemini";

/** Oria's internal capability tiers, mapped to each provider's actual model. */
export type ProviderTier = "premium" | "fast" | "reasoning";

/** Which AI role a call belongs to. Infrastructure always uses Oria's key. */
export type QueryType = "infrastructure" | "conversation";

export type Role = "system" | "user" | "assistant";

/** A multimodal content part: plain text or an inline (base64) image. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; dataBase64: string };

/** Message content is either a plain string or a list of content parts. */
export type Message = { role: Role; content: string | ContentPart[] };

export type TokenUsage = { input: number; output: number };

/** A tool the model may call (JSON-schema input), provider-agnostic. */
export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/** Force a specific tool, or let the model decide. */
export type ToolChoice = "auto" | { type: "tool"; name: string };

/** A tool call the model emitted. */
export type ToolCall = { id: string; name: string; input: Record<string, unknown> };

export type CompletionOptions = {
  tier: ProviderTier;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  stopSequences?: string[];
  tools?: ToolDef[];
  toolChoice?: ToolChoice;
  /** OpenAI o-series reasoning effort; ignored by other providers. */
  reasoningEffort?: "low" | "medium" | "high";
  /** Optional usage callback, used by the per-query audit. */
  onUsage?: (usage: { tokens: TokenUsage; model: string; provider: ProviderName }) => void;
};

export type CompletionResult = {
  content: string;
  toolCalls?: ToolCall[];
  /** Reasoning trace when the provider returns one (primarily Anthropic). */
  thinkingContent?: string;
  tokensUsed: TokenUsage;
  model: string;
  provider: ProviderName;
};

export type ConnectionStatus = "active" | "invalid" | "rate_limited" | "out_of_credits";

/** Richer runtime error classification (drives fallback + surfacing). */
export type ErrorKind =
  | "invalid_key"
  | "rate_limited"
  | "out_of_credits"
  | "context_too_long"
  | "provider_unavailable"
  | "unknown";

export type ValidationResult = {
  valid: boolean;
  status: ConnectionStatus;
  error?: string;
  model?: string;
};

/** Every provider adapter implements this. Constructed with a concrete key. */
export interface ProviderAdapter {
  readonly provider: ProviderName;
  /** Non-streaming completion (supports tools + vision). */
  complete(messages: Message[], options: CompletionOptions): Promise<CompletionResult>;
  /** Streaming text completion: yields text deltas. Calls options.onUsage at the end. */
  streamComplete(messages: Message[], options: CompletionOptions): AsyncGenerator<string, void, unknown>;
  /** Embed one string. Note: dimensions differ per provider; Oria's 384-dim
   *  store is fed by the sidecar, so this is only for provider-native use. */
  embed(text: string): Promise<number[]>;
  /** Validate this adapter's key with a tiny live call. */
  validateKey(): Promise<ValidationResult>;
}
