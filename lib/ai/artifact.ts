import "server-only";

import { getProvider } from "@/lib/ai-providers";

/**
 * Live artifacts for Ask. When an answer reads better as a small visual (a
 * single headline number, amounts across categories or over time, multi-column
 * data, or a set of steps), an infra-AI pass turns the already-written answer
 * into a structured artifact the chat renders inline.
 *
 * This is INFRASTRUCTURE work (structuring text Oria already produced), so it
 * runs on Oria's key, never the user's conversation provider. It never invents
 * data: the artifact is built from the answer text the conversation model wrote.
 *
 * The deterministic gate + sanitizer are pure and unit-tested; only the
 * generation step calls a model.
 */

export type ArtifactType = "chart" | "checklist" | "table" | "stat_card";

export type Artifact =
  | { type: "stat_card"; label: string; value: string; sublabel?: string | null }
  | {
      type: "chart";
      chartKind: "bar" | "line";
      points: { label: string; value: number }[];
      caption?: string | null;
    }
  | { type: "table"; columns: string[]; rows: string[][]; caption?: string | null }
  | { type: "checklist"; title?: string | null; items: { text: string; done: boolean }[] };

const NUM_RE = /\d/;

/**
 * Cheap deterministic gate: only spend a model call attempting an artifact when
 * the answer plausibly benefits. Keeps simple lookups ("when is my flight") on
 * the plain text path. Pure + tested.
 */
export function shouldAttemptArtifact(query: string, answer: string): boolean {
  const a = answer.trim();
  if (a.length < 40) return false; // a one-liner is already the best form

  const q = query.toLowerCase();
  const body = a.toLowerCase();

  // Explicit asks for a visual shape.
  const SHAPE = [
    "chart",
    "graph",
    "table",
    "checklist",
    "list",
    "breakdown",
    "compare",
    "comparison",
    "trend",
    "over time",
    "step",
    "checklist",
    "each",
    "by month",
    "by week",
    "by category",
  ];
  if (SHAPE.some((k) => q.includes(k) || body.includes(k))) return true;

  // Roll-ups: a "how much / how many" question with numbers in the answer.
  const rollup = /(how much|how many|total|spent|breakdown|summary|across)/.test(q);
  if (rollup && NUM_RE.test(a)) return true;

  // Several numeric lines (a natural table/chart) in the answer.
  const numericLines = a.split(/\n|[.;]\s/).filter((s) => NUM_RE.test(s)).length;
  if (numericLines >= 3) return true;

  return false;
}

const SYSTEM = `You turn an assistant's answer into ONE small visual artifact, but only when it genuinely helps the reader. You receive the user's QUESTION and the assistant's ANSWER. Return a single JSON object and nothing else.

Choose at most one:
- {"type":"none"} when the answer is already best as plain text (most short answers).
- {"type":"stat_card","label":"...","value":"...","sublabel":"..."} for one headline figure. value is the number/amount as a string; sublabel is optional context.
- {"type":"chart","chartKind":"bar"|"line","points":[{"label":"Jan","value":120}],"caption":"..."} for amounts across categories (bar) or over time (line). 2 to 12 points.
- {"type":"table","columns":["Item","Amount"],"rows":[["Rent","2500"]],"caption":"..."} for multi-column data. Up to 6 columns, 20 rows.
- {"type":"checklist","title":"...","items":[{"text":"Renew passport","done":false}]} for steps or to-dos. Up to 20 items, done is false unless the answer states it is complete.

HARD RULES:
- NEVER invent data. Use only numbers, labels, and facts present in the ANSWER. If the answer does not contain enough concrete data for a clean artifact, return {"type":"none"}.
- Numbers in chart points must be plain numbers (no currency symbols, no commas).
- Keep labels short. No commentary, no markdown, JSON only.
- No em-dashes in any string.`;

/**
 * Generate an artifact for an answer, or null when none fits. Infra AI (Oria's
 * key). Never throws: returns null on any provider or parse failure.
 */
export async function generateArtifact(input: {
  userId: string;
  query: string;
  answer: string;
}): Promise<Artifact | null> {
  try {
    const adapter = await getProvider(input.userId, "infrastructure");
    if (!adapter) return null;
    const user = `QUESTION:\n${input.query.slice(0, 600)}\n\nANSWER:\n${input.answer.slice(0, 2400)}`;
    const res = await adapter.complete(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      { tier: "fast", maxTokens: 700, jsonMode: true },
    );
    const text = res.content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    return sanitizeArtifact(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Validate + clamp a raw model object into a safe Artifact, or null. Pure. */
export function sanitizeArtifact(raw: unknown): Artifact | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = o.type;

  const str = (v: unknown, max = 120): string =>
    typeof v === "string" ? v.replace(/\u2014/g, "-").trim().slice(0, max) : "";
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v.replace(/[,$\s]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  if (type === "stat_card") {
    const label = str(o.label);
    const value = str(o.value, 40);
    if (!label || !value) return null;
    const sublabel = str(o.sublabel, 120) || null;
    return { type: "stat_card", label, value, sublabel };
  }

  if (type === "chart") {
    const chartKind = o.chartKind === "line" ? "line" : "bar";
    const rawPoints = Array.isArray(o.points) ? o.points : [];
    const points = rawPoints
      .map((p) => {
        const pr = p as Record<string, unknown>;
        const v = num(pr?.value);
        const label = str(pr?.label, 24);
        return v === null || !label ? null : { label, value: v };
      })
      .filter((p): p is { label: string; value: number } => p !== null)
      .slice(0, 12);
    if (points.length < 2) return null;
    return { type: "chart", chartKind, points, caption: str(o.caption) || null };
  }

  if (type === "table") {
    const columns = (Array.isArray(o.columns) ? o.columns : [])
      .map((c) => str(c, 32))
      .filter(Boolean)
      .slice(0, 6);
    if (columns.length < 1) return null;
    const rows = (Array.isArray(o.rows) ? o.rows : [])
      .map((r) =>
        (Array.isArray(r) ? r : [])
          .map((c) => str(c, 60))
          .slice(0, columns.length),
      )
      .filter((r) => r.length === columns.length)
      .slice(0, 20);
    if (rows.length < 1) return null;
    return { type: "table", columns, rows, caption: str(o.caption) || null };
  }

  if (type === "checklist") {
    const items = (Array.isArray(o.items) ? o.items : [])
      .map((it) => {
        const ir = it as Record<string, unknown>;
        const text = str(ir?.text, 120);
        return text ? { text, done: ir?.done === true } : null;
      })
      .filter((it): it is { text: string; done: boolean } => it !== null)
      .slice(0, 20);
    if (items.length < 1) return null;
    return { type: "checklist", title: str(o.title) || null, items };
  }

  return null;
}
