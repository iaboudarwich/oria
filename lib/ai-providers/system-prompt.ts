/**
 * Provider-agnostic system-prompt normalization.
 *
 * The three providers receive a system prompt three different ways:
 *   - Anthropic: a dedicated top-level `system` parameter.
 *   - OpenAI (chat): a `system` role message; o-series reasoning models reject
 *     the system role, so the text is folded into the first user turn.
 *   - Gemini: no system role at all, so the text is prepended to the first user
 *     turn.
 *
 * Before this module each adapter computed "the system text" with its own small
 * join, which is exactly the kind of thing that drifts (one used a different
 * separator, one dropped multimodal parts). This is the SINGLE definition of
 * how Oria's flat message list maps to each provider's system handling, so the
 * identical voice guidance reaches every provider intact. Pure (no SDK, no
 * server-only) so parity is testable without a key.
 */

import type { ContentPart, Message } from "./types";

/** Flatten one message's content to its text (image parts contribute nothing). */
export function contentText(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .map((p) => (p.type === "text" ? p.text : ""))
    .filter(Boolean)
    .join("\n");
}

/**
 * The single system string for a request: every system-role message joined in
 * order with a blank line between. This is the exact text that must reach every
 * provider, whatever shape that provider wants it in.
 */
export function flattenSystem(messages: Message[]): string {
  return messages
    .filter((m) => m.role === "system")
    .map((m) => contentText(m.content))
    .filter(Boolean)
    .join("\n\n");
}

/** The non-system turns, untouched (system handling is provider-specific). */
export function nonSystemMessages(messages: Message[]): Message[] {
  return messages.filter((m) => m.role !== "system");
}

/**
 * Fold the system text into the first user turn, preserving any multimodal
 * parts. Used by providers with no usable system role (OpenAI o-series, and the
 * same shape Gemini needs). If there is no user turn, the system text becomes a
 * leading user turn of its own. Returns the messages unchanged when there is no
 * system text.
 */
export function foldSystemIntoFirstUser(messages: Message[]): Message[] {
  const system = flattenSystem(messages);
  const rest = nonSystemMessages(messages);
  if (!system) return rest;

  const out = [...rest];
  const i = out.findIndex((m) => m.role === "user");
  if (i >= 0) {
    const m = out[i];
    out[i] =
      typeof m.content === "string"
        ? { role: "user", content: `${system}\n\n${m.content}` }
        : { role: "user", content: [{ type: "text", text: system }, ...m.content] };
  } else {
    out.unshift({ role: "user", content: system });
  }
  return out;
}
