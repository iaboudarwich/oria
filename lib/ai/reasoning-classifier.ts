import "server-only";

import { getProvider } from "@/lib/ai-providers";

export type ReasoningClass = { analytical: boolean; confidence: number };

const SYSTEM = `Classify a user's question as either "analytical" or "retrieval".

analytical: variance, comparison, ratio analysis, trends, why-questions,
multi-step reasoning, trade-offs, or deep analysis across several records.
retrieval: a lookup, find, when/who, basic recall, or a simple list.

Return ONLY JSON: {"analytical": true|false, "confidence": 0.0-1.0}. confidence
is how sure you are of the label.`;

/**
 * Cheap upfront classifier (fast tier) deciding whether an Ask Oria question is
 * analytical enough to offer deeper reasoning. Designed to run in parallel with
 * retrieval; never throws (returns not-analytical on any failure).
 */
export async function classifyReasoningIntent(
  userId: string,
  query: string,
): Promise<ReasoningClass> {
  try {
    const adapter = await getProvider(userId, "conversation");
    if (!adapter) return { analytical: false, confidence: 0 };
    const res = await adapter.complete(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: query.slice(0, 600) },
      ],
      { tier: "fast", maxTokens: 40, jsonMode: true },
    );
    const raw = res.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(raw) as { analytical?: unknown; confidence?: unknown };
    return {
      analytical: parsed.analytical === true,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    };
  } catch {
    return { analytical: false, confidence: 0 };
  }
}
