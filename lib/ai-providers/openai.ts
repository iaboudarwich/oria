import "server-only";

import OpenAI from "openai";
import { modelFor, EMBEDDING_MODEL } from "./model-map";
import { mapErrorToStatus, errorStatus, errorMessage } from "./errors";
import type {
  CompletionOptions,
  CompletionResult,
  Message,
  ProviderAdapter,
  ValidationResult,
} from "./types";

export class OpenAIAdapter implements ProviderAdapter {
  readonly provider = "openai" as const;
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(messages: Message[], options: CompletionOptions): Promise<CompletionResult> {
    const model = modelFor("openai", options.tier);
    const res = await this.client.chat.completions.create({
      model,
      max_tokens: options.maxTokens ?? 1024,
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.stopSequences ? { stop: options.stopSequences } : {}),
      ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const content = res.choices[0]?.message?.content ?? "";
    const tokensUsed = {
      input: res.usage?.prompt_tokens ?? 0,
      output: res.usage?.completion_tokens ?? 0,
    };
    options.onUsage?.({ tokens: tokensUsed, model, provider: "openai" });
    return { content, tokensUsed, model, provider: "openai" };
  }

  async *streamComplete(messages: Message[], options: CompletionOptions): AsyncGenerator<string> {
    const model = modelFor("openai", options.tier);
    const stream = await this.client.chat.completions.create({
      model,
      max_tokens: options.maxTokens ?? 1024,
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      stream_options: { include_usage: true },
    });
    let input = 0;
    let output = 0;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
      if (chunk.usage) {
        input = chunk.usage.prompt_tokens;
        output = chunk.usage.completion_tokens;
      }
    }
    options.onUsage?.({ tokens: { input, output }, model, provider: "openai" });
  }

  async embed(text: string): Promise<number[]> {
    const res = await this.client.embeddings.create({ model: EMBEDDING_MODEL.openai, input: text });
    return res.data[0]?.embedding ?? [];
  }

  async validateKey(): Promise<ValidationResult> {
    try {
      const res = await this.client.chat.completions.create({
        model: modelFor("openai", "fast"),
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
