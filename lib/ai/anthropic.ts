import "server-only";

import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null = null;

/**
 * Lazy Anthropic client. Returns null when ANTHROPIC_API_KEY isn't set so
 * callers can render a friendly "connect Claude" UI instead of crashing.
 */
export function getAnthropic(): Anthropic | null {
  if (cached) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  cached = new Anthropic({ apiKey: key });
  return cached;
}

export function getModel(): string {
  // Haiku 4.5 is the cheapest/fastest current model and excels at
  // retrieval-augmented Q&A. Set ANTHROPIC_MODEL to switch.
  return process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
}

export function isAnthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
