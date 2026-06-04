import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { embedQueryViaService } from "@/lib/extraction/service";
import { modelFor, ANTHROPIC_THINKING_BUDGET } from "./model-map";
import { mapErrorToStatus, errorStatus, errorMessage } from "./errors";
import { flattenSystem, nonSystemMessages } from "./system-prompt";
import type {
  CompletionOptions,
  CompletionResult,
  ContentPart,
  Message,
  ProviderAdapter,
  ToolCall,
  ValidationResult,
} from "./types";

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

/** Convert one message's content to Anthropic blocks (string passes through). */
function toBlocks(content: string | ContentPart[]): string | AnthropicBlock[] {
  if (typeof content === "string") return content;
  return content.map((p) =>
    p.type === "text"
      ? { type: "text" as const, text: p.text }
      : {
          type: "image" as const,
          source: { type: "base64" as const, media_type: p.mimeType, data: p.dataBase64 },
        },
  );
}

/** Split Oria's flat messages into Anthropic's (system, messages) shape. The
 *  system string comes from the shared normalization so it is byte-identical to
 *  what the other providers receive. */
function splitMessages(messages: Message[]): {
  system: string;
  msgs: { role: "user" | "assistant"; content: string | AnthropicBlock[] }[];
} {
  const system = flattenSystem(messages);
  const msgs = nonSystemMessages(messages).map((m) => ({
    role: m.role as "user" | "assistant",
    content: toBlocks(m.content),
  }));
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
    const reasoning = options.tier === "reasoning";
    const { system, msgs } = splitMessages(messages);
    const tools = options.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Messages.Tool["input_schema"],
    }));
    const toolChoice =
      options.toolChoice === "auto"
        ? ({ type: "auto" } as const)
        : options.toolChoice
          ? ({ type: "tool", name: options.toolChoice.name } as const)
          : undefined;

    // Extended thinking needs headroom: max_tokens must exceed the thinking
    // budget, and temperature is fixed to 1 (omit any override).
    const maxTokens = reasoning
      ? ANTHROPIC_THINKING_BUDGET + (options.maxTokens ?? 1024)
      : options.maxTokens ?? 1024;

    const res = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(reasoning
        ? { thinking: { type: "enabled" as const, budget_tokens: ANTHROPIC_THINKING_BUDGET } }
        : options.temperature != null
          ? { temperature: options.temperature }
          : {}),
      ...(options.stopSequences && !reasoning ? { stop_sequences: options.stopSequences } : {}),
      ...(system ? { system } : {}),
      ...(tools ? { tools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
      messages: msgs as Anthropic.Messages.MessageParam[],
    });

    const content = res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const thinkingContent = res.content
      .filter((b): b is Anthropic.Messages.ThinkingBlock => b.type === "thinking")
      .map((b) => b.thinking)
      .join("\n");
    const toolCalls: ToolCall[] = res.content
      .filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

    const tokensUsed = { input: res.usage.input_tokens, output: res.usage.output_tokens };
    options.onUsage?.({ tokens: tokensUsed, model, provider: "anthropic" });
    if (thinkingContent) options.onThinking?.(thinkingContent);
    return {
      content,
      ...(toolCalls.length ? { toolCalls } : {}),
      ...(thinkingContent ? { thinkingContent } : {}),
      tokensUsed,
      model,
      provider: "anthropic",
    };
  }

  async *streamComplete(messages: Message[], options: CompletionOptions): AsyncGenerator<string> {
    const model = modelFor("anthropic", options.tier);
    const reasoning = options.tier === "reasoning";
    const { system, msgs } = splitMessages(messages);
    const maxTokens = reasoning
      ? ANTHROPIC_THINKING_BUDGET + (options.maxTokens ?? 1024)
      : options.maxTokens ?? 1024;
    const stream = this.client.messages.stream({
      model,
      max_tokens: maxTokens,
      ...(reasoning
        ? { thinking: { type: "enabled" as const, budget_tokens: ANTHROPIC_THINKING_BUDGET } }
        : options.temperature != null
          ? { temperature: options.temperature }
          : {}),
      ...(system ? { system } : {}),
      messages: msgs as Anthropic.Messages.MessageParam[],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
    const final = await stream.finalMessage();
    const thinking = final.content
      .filter((b): b is Anthropic.Messages.ThinkingBlock => b.type === "thinking")
      .map((b) => b.thinking)
      .join("\n");
    if (thinking) options.onThinking?.(thinking);
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
