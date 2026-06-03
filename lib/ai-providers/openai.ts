import "server-only";

import OpenAI from "openai";
import { modelFor, EMBEDDING_MODEL } from "./model-map";
import { mapErrorToStatus, errorStatus, errorMessage } from "./errors";
import type {
  CompletionOptions,
  CompletionResult,
  ContentPart,
  Message,
  ProviderAdapter,
  ToolCall,
  ToolDef,
  ValidationResult,
} from "./types";

/** Convert one message's content to OpenAI's content (string or parts). */
function toOpenAIContent(content: string | ContentPart[]):
  | string
  | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  if (typeof content === "string") return content;
  return content.map((p) =>
    p.type === "text"
      ? ({ type: "text", text: p.text } as const)
      : ({
          type: "image_url",
          image_url: { url: `data:${p.mimeType};base64,${p.dataBase64}` },
        } as const),
  );
}

/** Map our messages to OpenAI chat messages (system role is supported). */
function toOpenAIMessages(messages: Message[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === "system") {
      return { role: "system", content: typeof m.content === "string" ? m.content : "" };
    }
    return {
      role: m.role,
      content: toOpenAIContent(m.content),
    } as OpenAI.Chat.Completions.ChatCompletionMessageParam;
  });
}

function toOpenAITools(tools: ToolDef[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

export class OpenAIAdapter implements ProviderAdapter {
  readonly provider = "openai" as const;
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(messages: Message[], options: CompletionOptions): Promise<CompletionResult> {
    const model = modelFor("openai", options.tier);
    const toolChoice =
      options.toolChoice === "auto"
        ? ("auto" as const)
        : options.toolChoice
          ? ({ type: "function" as const, function: { name: options.toolChoice.name } })
          : undefined;

    const res = await this.client.chat.completions.create({
      model,
      max_tokens: options.maxTokens ?? 1024,
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.stopSequences ? { stop: options.stopSequences } : {}),
      ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
      ...(options.tools ? { tools: toOpenAITools(options.tools) } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
      messages: toOpenAIMessages(messages),
    });

    const msg = res.choices[0]?.message;
    const content = msg?.content ?? "";
    // Parallel tool calls arrive as multiple entries in one assistant message.
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? [])
      .filter((c): c is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: "function" } =>
        c.type === "function",
      )
      .map((c) => ({
        id: c.id,
        name: c.function.name,
        input: safeJson(c.function.arguments),
      }));

    const tokensUsed = {
      input: res.usage?.prompt_tokens ?? 0,
      output: res.usage?.completion_tokens ?? 0,
    };
    options.onUsage?.({ tokens: tokensUsed, model, provider: "openai" });
    return {
      content,
      ...(toolCalls.length ? { toolCalls } : {}),
      tokensUsed,
      model,
      provider: "openai",
    };
  }

  async *streamComplete(messages: Message[], options: CompletionOptions): AsyncGenerator<string> {
    const model = modelFor("openai", options.tier);
    const stream = await this.client.chat.completions.create({
      model,
      max_tokens: options.maxTokens ?? 1024,
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      messages: toOpenAIMessages(messages),
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

function safeJson(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
