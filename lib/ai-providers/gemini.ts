import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { modelFor, EMBEDDING_MODEL } from "./model-map";
import { mapErrorToStatus, errorStatus, errorMessage } from "./errors";
import { flattenSystem } from "./system-prompt";
import type {
  CompletionOptions,
  CompletionResult,
  ContentPart,
  Message,
  ProviderAdapter,
  ValidationResult,
} from "./types";

/** One Gemini content part: text, or an inline (base64) image. */
type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/**
 * Map Oria's message content to Gemini parts. Text becomes a text part; an
 * image block becomes an inlineData part (base64 + mimeType), so Gemini reads
 * attached images as a true multimodal provider. Gemini accepts png, jpeg,
 * webp, heic, and heif, which matches Oria's upload allowlist (HEIC is already
 * converted to JPEG upstream in lib/ai/ask-images.ts).
 */
function partsFor(content: string | ContentPart[]): GeminiPart[] {
  if (typeof content === "string") return [{ text: content }];
  const parts: GeminiPart[] = [];
  for (const p of content) {
    if (p.type === "text") {
      if (p.text) parts.push({ text: p.text });
    } else {
      parts.push({ inlineData: { mimeType: p.mimeType, data: p.dataBase64 } });
    }
  }
  return parts.length > 0 ? parts : [{ text: "" }];
}

/**
 * Map Oria's flat messages to Gemini's contents/parts. Gemini has no system
 * role, so system text is prepended to the first user turn; assistant maps to
 * the "model" role. Image parts are preserved per turn.
 */
function toGeminiContents(messages: Message[]): { role: "user" | "model"; parts: GeminiPart[] }[] {
  const system = flattenSystem(messages);
  const turns = messages.filter((m) => m.role !== "system");
  const out: { role: "user" | "model"; parts: GeminiPart[] }[] = [];
  let systemInjected = false;
  for (const m of turns) {
    const role = m.role === "assistant" ? "model" : "user";
    const parts = partsFor(m.content);
    if (!systemInjected && role === "user" && system) {
      // Prepend the system context as a leading text part on the first user turn.
      parts.unshift({ text: `${system}\n\n` });
      systemInjected = true;
    }
    out.push({ role, parts });
  }
  if (!systemInjected && system) {
    out.unshift({ role: "user", parts: [{ text: system }] });
  }
  return out;
}

export class GeminiAdapter implements ProviderAdapter {
  readonly provider = "gemini" as const;
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async complete(messages: Message[], options: CompletionOptions): Promise<CompletionResult> {
    const modelName = modelFor("gemini", options.tier);
    const model = this.client.getGenerativeModel({ model: modelName });
    const res = await model.generateContent({
      contents: toGeminiContents(messages),
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 1024,
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
        ...(options.jsonMode ? { responseMimeType: "application/json" } : {}),
        ...(options.stopSequences ? { stopSequences: options.stopSequences } : {}),
      },
    });
    const content = res.response.text();
    const usage = res.response.usageMetadata;
    const tokensUsed = { input: usage?.promptTokenCount ?? 0, output: usage?.candidatesTokenCount ?? 0 };
    options.onUsage?.({ tokens: tokensUsed, model: modelName, provider: "gemini" });
    return { content, tokensUsed, model: modelName, provider: "gemini" };
  }

  async *streamComplete(messages: Message[], options: CompletionOptions): AsyncGenerator<string> {
    const modelName = modelFor("gemini", options.tier);
    const model = this.client.getGenerativeModel({ model: modelName });
    const res = await model.generateContentStream({
      contents: toGeminiContents(messages),
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 1024,
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
      },
    });
    for await (const chunk of res.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
    const final = await res.response;
    const usage = final.usageMetadata;
    options.onUsage?.({
      tokens: { input: usage?.promptTokenCount ?? 0, output: usage?.candidatesTokenCount ?? 0 },
      model: modelName,
      provider: "gemini",
    });
  }

  async embed(text: string): Promise<number[]> {
    const model = this.client.getGenerativeModel({ model: EMBEDDING_MODEL.gemini });
    const res = await model.embedContent(text);
    return res.embedding.values ?? [];
  }

  async validateKey(): Promise<ValidationResult> {
    try {
      const model = this.client.getGenerativeModel({ model: modelFor("gemini", "fast") });
      await model.generateContent({
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        generationConfig: { maxOutputTokens: 4 },
      });
      return { valid: true, status: "active", model: modelFor("gemini", "fast") };
    } catch (err) {
      const status = mapErrorToStatus(errorStatus(err), errorMessage(err));
      return { valid: false, status, error: errorMessage(err).slice(0, 200) };
    }
  }
}
