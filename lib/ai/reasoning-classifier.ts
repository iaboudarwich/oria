import "server-only";

import { runFastJsonClassifier } from "./classifiers/base";

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
  return runFastJsonClassifier<ReasoningClass>(userId, query, {
    system: SYSTEM,
    maxTokens: 40,
    fallback: { analytical: false, confidence: 0 },
    parse: (raw) => {
      const p = raw as { analytical?: unknown; confidence?: unknown };
      return {
        analytical: p.analytical === true,
        confidence: Math.max(0, Math.min(1, Number(p.confidence) || 0)),
      };
    },
  });
}
