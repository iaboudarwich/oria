import "server-only";

import { getProvider } from "@/lib/ai-providers";

/**
 * Shared scaffold for the cheap Ask Oria classifiers (reasoning intent,
 * setup intent). Each runs the user's conversation provider on the fast tier in
 * JSON mode, strips any code fence, and parses. Never throws: returns `fallback`
 * on any provider or parse failure, and `parse` may return null to fall back too.
 */
export async function runFastJsonClassifier<T>(
  userId: string,
  query: string,
  opts: { system: string; maxTokens: number; parse: (raw: unknown) => T | null; fallback: T },
): Promise<T> {
  try {
    const adapter = await getProvider(userId, "conversation");
    if (!adapter) return opts.fallback;
    const res = await adapter.complete(
      [
        { role: "system", content: opts.system },
        { role: "user", content: query.slice(0, 600) },
      ],
      { tier: "fast", maxTokens: opts.maxTokens, jsonMode: true },
    );
    const text = res.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return opts.parse(JSON.parse(text)) ?? opts.fallback;
  } catch {
    return opts.fallback;
  }
}
