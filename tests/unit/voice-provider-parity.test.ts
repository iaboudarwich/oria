import { describe, it, expect } from "vitest";
import { VOICE_RULES } from "@/lib/voice/oria-voice";
import {
  flattenSystem,
  nonSystemMessages,
  foldSystemIntoFirstUser,
  contentText,
} from "@/lib/ai-providers/system-prompt";
import type { Message } from "@/lib/ai-providers/types";

/**
 * F3(b) construction parity. No API keys: this proves that the SAME request
 * injects byte-identical voice guidance into every provider, by exercising the
 * single shared normalization the three adapters now delegate their system
 * handling to (lib/ai-providers/system-prompt.ts):
 *   - Anthropic puts flattenSystem() in its top-level `system` field.
 *   - OpenAI (chat) keeps it as a system message (= flattenSystem()).
 *   - OpenAI (o-series) and Gemini have no usable system role, so the text is
 *     folded into the first user turn via foldSystemIntoFirstUser().
 * In every case the full VOICE_RULES text must arrive intact and identical.
 */

const ASK_SYSTEM = `You are Oria.\n\n${VOICE_RULES}\n\nCONTENT RULES: answer from the SOURCES block.`;

function askMessages(userContent: Message["content"]): Message[] {
  return [
    { role: "system", content: ASK_SYSTEM },
    { role: "user", content: userContent },
  ];
}

/** Mirror each adapter's system handling using the shared pure helpers, and
 *  return the voice text that actually reaches that provider. */
function voiceDeliveredTo(
  provider: "anthropic" | "openai" | "gemini",
  messages: Message[],
): string {
  if (provider === "anthropic") {
    // Delivered verbatim as the `system` field.
    return flattenSystem(messages);
  }
  // OpenAI o-series and Gemini fold the system into the first user turn; the
  // folded turn leads with the full system text.
  const folded = foldSystemIntoFirstUser(messages);
  const firstUser = folded.find((m) => m.role === "user");
  return contentText(firstUser!.content);
}

describe("voice reaches every provider intact", () => {
  const messages = askMessages(
    "SOURCES\n[1] passport expires 2028-09-14\n\nQUESTION\nwhen does my passport expire?",
  );

  it("flattenSystem carries the full voice block", () => {
    expect(flattenSystem(messages)).toContain(VOICE_RULES);
  });

  it("every provider receives the complete VOICE_RULES", () => {
    for (const p of ["anthropic", "openai", "gemini"] as const) {
      expect(voiceDeliveredTo(p, messages), `${p} dropped voice`).toContain(VOICE_RULES);
    }
  });

  it("the voice text is byte-identical across all three providers", () => {
    const anthropic = voiceDeliveredTo("anthropic", messages);
    const openai = voiceDeliveredTo("openai", messages);
    const gemini = voiceDeliveredTo("gemini", messages);
    // The system field (Anthropic) equals the leading text folded into the user
    // turn (OpenAI o-series / Gemini), so the voice arrives the same everywhere.
    expect(openai.startsWith(anthropic)).toBe(true);
    expect(gemini.startsWith(anthropic)).toBe(true);
    expect(openai).toBe(gemini);
  });
});

describe("system normalization edge cases hold across providers", () => {
  it("preserves multimodal user parts while injecting the full system text", () => {
    const messages = askMessages([
      { type: "text", text: "what is this receipt?" },
      { type: "image", mimeType: "image/png", dataBase64: "AAAA" },
    ]);
    const folded = foldSystemIntoFirstUser(messages);
    const firstUser = folded.find((m) => m.role === "user")!;
    expect(Array.isArray(firstUser.content)).toBe(true);
    const parts = firstUser.content as Exclude<Message["content"], string>;
    // Leading text part carries the voice; the image part survives.
    expect(parts[0]).toEqual({ type: "text", text: ASK_SYSTEM });
    expect(parts.some((p) => p.type === "image")).toBe(true);
    expect(voiceDeliveredTo("gemini", messages)).toContain(VOICE_RULES);
  });

  it("joins multiple system messages identically for every provider", () => {
    const messages: Message[] = [
      { role: "system", content: "You are Oria." },
      { role: "system", content: VOICE_RULES },
      { role: "user", content: "hi" },
    ];
    const joined = `You are Oria.\n\n${VOICE_RULES}`;
    expect(flattenSystem(messages)).toBe(joined);
    expect(voiceDeliveredTo("openai", messages).startsWith(joined)).toBe(true);
    expect(voiceDeliveredTo("gemini", messages).startsWith(joined)).toBe(true);
  });

  it("nonSystemMessages drops system turns and preserves order", () => {
    const messages: Message[] = [
      { role: "system", content: "s" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
    ];
    expect(nonSystemMessages(messages).map((m) => m.content)).toEqual(["u1", "a1", "u2"]);
  });

  it("folds system into a leading user turn when there is no user message", () => {
    const messages: Message[] = [{ role: "system", content: "voice-only" }];
    const folded = foldSystemIntoFirstUser(messages);
    expect(folded).toEqual([{ role: "user", content: "voice-only" }]);
  });
});
