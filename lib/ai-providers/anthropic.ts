import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { embedQueryViaService } from "@/lib/extraction/service";
import { modelFor } from "./model-map";
import { mapErrorToStatus, errorStatus, errorMessage } from "./errors";
import type {
  CompletionOptions,
  CompletionResult,
  Message,
  ProviderAdapter,
  ValidationResult,
} from "./types";

/** Split Oria's flat messages into Anthropic's (system, messages) shape. */
function splitMessages(messages: Message[]): {
  system: string;
  msgs: { role: "user" | "assistant"; content: string }[];
} {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const msgs = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  return { system, msgs };
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly provider = "anthropic" as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(messages: Message[], options: CompletionOptions): Promise<CompletionResult> {
    const model = modelFor("anthropic", options.tier);
    const { system, msgs } = splitMessages(messages);
    const res = await this.client.messages.create({
      model,
      max_tokens: options.maxTokens ?? 1024,
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.stopSequences ? { stop_sequences: options.stopSequences } : {}),
      ...(system ? { system } : {}),
      messages: msgs,
    });
    const content = res.content[0]?.type === "text" ? res.content[0].text : "";
    const tokensUsed = { input: res.usage.input_tokens, output: res.usage.output_tokens };
    options.onUsage?.({ tokens: tokensUsed, model, provider: "anthropic" });
    return { content, tokensUsed, model, provider: "anthropic" };
  }

  async *streamComplete(messages: Message[], options: CompletionOptions): AsyncGenerator<string> {
    const model = modelFor("anthropic", options.tier);
    const { system, msgs } = splitMessages(messages);
    const stream = this.client.messages.stream({
      model,
      max_tokens: options.maxTokens ?? 1024,
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(system ? { system } : {}),
      messages: msgs,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    options.onUsage?.({
      tokens: { input: final.usage.input_tokens, output: final.usage.output_tokens },
      model,
      provider: "anthropic",
    });
  }

  /** Anthropic has no embeddings API; Oria embeds via the sidecar (384-dim). */
  async embed(text: string): Promise<number[]> {
    return (await embedQueryViaService(text)) ?? [];
  }

  async validateKey(): Promise<ValidationResult> {
    try {
      const res = await this.client.messages.create({
        model: modelFor("anthropic", "fast"),
        max_tokens: 4,
        messages: [{ role: "user", content: "Hi" }],
      });
      return { valid: true, status: "active", model: res.model };
    } catch (err) {
      const status = mapErrorToStatus(errorStatus(err), errorMessage(err));
      return { valid: false, status, error: errorMessage(err).slice(0, 200) };
    }
  }
}
