import "server-only";

import { runFastJsonClassifier } from "./base";

export type SetupIntent = {
  intent: "setup" | "normal";
  confidence: number;
  actionType?: "create" | "delete" | "rename" | "modify";
  targetHint?: string;
};

const SYSTEM = `Classify the user's Ask Oria query as either "setup" or "normal".

setup: the user is asking to CHANGE Oria's structure, create / delete / rename /
modify a space, section, workspace, or circle. Examples: "make me a coaching
workspace", "add a section for freelance work", "delete the kids section",
"rename Travel to Adventures", "set up something for my new job".

normal: the user is asking for information, retrieval, analysis, or HOW to do
something. Examples: "what is in my Travel section", "when did I last spend on
dental", "why is my Bills section empty", "how do I add a section" (this is
instructional, answer it, do NOT treat as setup).

Be conservative: when unsure, choose normal. Only choose setup when the user is
clearly asking Oria to make the change for them.

Return ONLY JSON:
{"intent":"setup"|"normal","confidence":0.0-1.0,"action_type":"create"|"delete"|"rename"|"modify","target_hint":"short phrase or null"}`;

/**
 * Cheap upfront classifier (fast tier) deciding whether an Ask Oria query is a
 * setup request that should reroute to the reshape engine. Runs in parallel with
 * the reasoning classifier; never throws (returns normal on any failure).
 * Conservative: callers should only act on intent==='setup' with confidence>0.75.
 */
export async function classifySetupIntent(userId: string, query: string): Promise<SetupIntent> {
  return runFastJsonClassifier<SetupIntent>(userId, query, {
    system: SYSTEM,
    maxTokens: 60,
    fallback: { intent: "normal", confidence: 0 },
    parse: (raw) => {
      const parsed = raw as {
        intent?: unknown;
        confidence?: unknown;
        action_type?: unknown;
        target_hint?: unknown;
      };
      return {
        intent: parsed.intent === "setup" ? "setup" : "normal",
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        actionType:
          parsed.action_type === "create" ||
          parsed.action_type === "delete" ||
          parsed.action_type === "rename" ||
          parsed.action_type === "modify"
            ? parsed.action_type
            : undefined,
        targetHint: typeof parsed.target_hint === "string" ? parsed.target_hint : undefined,
      };
    },
  });
}
