import "server-only";

import { getProvider } from "@/lib/ai-providers";
import type { Section } from "@/lib/supabase/types";

/**
 * Smart paste: when a user pastes a chunk of content (a flight confirmation, a
 * receipt, an invoice), classify it and offer to file it in the right section.
 * This is INFRASTRUCTURE work (Oria's key). It only proposes; nothing is filed
 * until the user confirms, at which point the real extraction pipeline runs
 * (lib/data/paste-actions.ts -> logFromText).
 *
 * The deterministic gate is pure + tested; only classification calls a model.
 */

const SECTIONS: Section[] = [
  "household",
  "travel",
  "properties",
  "staff",
  "events",
  "finance",
  "legal",
  "personal",
  "vendors",
  "health",
];

export type PasteClassification = {
  /** "file" when the paste is something worth filing, else "none". */
  kind: "file" | "none";
  section: Section | null;
  documentType: string | null;
  title: string;
};

const NONE: PasteClassification = { kind: "none", section: null, documentType: null, title: "" };

/**
 * Only offer smart-paste for a substantial, content-shaped paste. A pasted word
 * or short phrase is left alone. Pure + tested.
 */
export function shouldOfferPaste(text: string): boolean {
  const t = (text ?? "").trim();
  if (t.length < 120) return false;
  const lines = t.split(/\n/).filter((l) => l.trim()).length;
  const sentences = t.split(/[.!?]\s/).filter(Boolean).length;
  return lines >= 2 || sentences >= 3;
}

const SYSTEM = `You classify a block of text a user just pasted, to decide whether Oria should offer to file it and where. Return a single JSON object and nothing else:
{"kind":"file"|"none","section":<one of household|travel|properties|staff|events|finance|legal|personal|vendors|health or null>,"document_type":<short label like flight, receipt, invoice, itinerary, contract, booking, or null>,"title":"<a short human title, max 60 chars>"}

Guidance:
- "file" when the paste is a real document or confirmation worth keeping: a flight or boarding confirmation (section travel), a receipt or invoice or bank line (finance), a hotel or itinerary (travel), a lease or contract (legal or properties), an appointment or event (events), a medical note (health).
- "none" for casual chatter, a question to Oria, a snippet of code, or anything not worth filing.
- Pick the single best section. Use null only when kind is none.
- Keep the title short and concrete, e.g. "Flight to Paris, June 26" or "Equinox receipt".
- JSON only. No commentary. No em-dashes in any string.`;

/** Classify a pasted block. Infra AI, never throws (returns none on failure). */
export async function classifyPaste(userId: string, text: string): Promise<PasteClassification> {
  try {
    const adapter = await getProvider(userId, "infrastructure");
    if (!adapter) return NONE;
    const res = await adapter.complete(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: text.slice(0, 2000) },
      ],
      { tier: "fast", maxTokens: 200, jsonMode: true },
    );
    const raw = res.content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    return sanitizePasteClass(JSON.parse(raw));
  } catch {
    return NONE;
  }
}

/** Validate a raw classification object into a safe shape. Pure. */
export function sanitizePasteClass(raw: unknown): PasteClassification {
  if (!raw || typeof raw !== "object") return NONE;
  const o = raw as Record<string, unknown>;
  if (o.kind !== "file") return NONE;
  const section =
    typeof o.section === "string" && SECTIONS.includes(o.section as Section)
      ? (o.section as Section)
      : null;
  if (!section) return NONE; // no section to file into means no useful offer
  const documentType =
    typeof o.document_type === "string"
      ? o.document_type
          .replace(/\u2014/g, "-")
          .trim()
          .slice(0, 40)
      : null;
  const title =
    typeof o.title === "string"
      ? o.title
          .replace(/\u2014/g, "-")
          .trim()
          .slice(0, 60)
      : "";
  return { kind: "file", section, documentType, title: title || (documentType ?? "Pasted note") };
}
