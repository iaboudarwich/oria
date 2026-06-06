import "server-only";

import { infraComplete, type ContentPart } from "@/lib/ai-providers";
import { recordAiCall } from "@/lib/ai/telemetry";

// Validation lists so a hallucinated enum never reaches the DB.
const VALID_SECTIONS = [
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
] as const;
const VALID_DOC_TYPES = [
  "receipt",
  "invoice",
  "boarding_pass",
  "ticket",
  "contract",
  "itinerary",
  "schedule",
  "form",
  "handwritten_note",
  "sticky_note",
  "screenshot",
  "photo",
  "scanned_document",
  "business_card",
  "resume",
  "unknown",
] as const;

export type GroupRecord = {
  title: string;
  document_type: string | null;
  section: string | null;
  smart_section: "diet" | "bills" | null;
  summary: string | null;
  merchant: string | null;
  amount_value: string | null;
  amount_currency: string | null;
  occurred_at: string | null;
  location: string | null;
  confidence: number;
  /** Which provided images (0-based, in order) this record draws from. */
  image_indexes: number[];
};

export type GroupExtraction = {
  /** true = the images are one logical thing -> a single merged record. */
  merged: boolean;
  reason: string;
  records: GroupRecord[];
};

export type GroupImage = { mimeType: string; dataBase64: string; filename: string };

const SYSTEM = `You are Oria's extraction model. A user dropped several images together in one action. First DECIDE whether they are ONE logical thing or SEVERAL distinct things, then return the record(s).

ONE logical thing: the images are different views or parts of the same item, so they belong together. Example: a flight booking made of a ticket, a boarding pass, and a screenshot that shows only a flight number. The bare flight-number screenshot is low signal on its own; read it in light of its siblings and fold it into the single flight record. Other examples: both sides of one ID card; a receipt plus a close-up of its line items; the pages of one contract.

SEVERAL distinct things: the images are unrelated. Example: five receipts from five different shops on five different days. Return one record per distinct thing. Never merge unrelated items into one blob.

When genuinely unsure, prefer SEVERAL: only merge when the images clearly describe the same single thing.

For each record: a short title, a document_type, a section, an optional smart_section, a one-line summary, and any merchant, amount, date (ISO 8601), or location you can read. image_indexes lists which provided images (0-based, in order) the record draws from; across all records every image index must appear exactly once.

section MUST be one of: ${VALID_SECTIONS.join(", ")}.
document_type MUST be one of: ${VALID_DOC_TYPES.join(", ")}.
smart_section is "diet" for food, "bills" for a bill or invoice owed or paid, otherwise null.
confidence is 0 to 1. Never use the em-dash character.

Return JSON only, no prose:
{"merged": true, "reason": "one short line", "records": [{"title": "...", "document_type": "ticket", "section": "travel", "smart_section": null, "summary": "...", "merchant": null, "amount_value": null, "amount_currency": null, "occurred_at": null, "location": null, "confidence": 0.9, "image_indexes": [0,1,2]}]}`;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Fold several records into one (used when the user forced a merge): keep the
 *  highest-confidence record's fields, union every image index onto it. */
function foldToOne(records: GroupRecord[]): GroupRecord {
  const base = records.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  const idxs = Array.from(new Set(records.flatMap((r) => r.image_indexes))).sort((a, b) => a - b);
  return { ...base, image_indexes: idxs };
}

function sanitize(parsed: unknown, imageCount: number, forceMerge = false): GroupExtraction | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const rawRecords = Array.isArray(p.records) ? p.records : [];
  const records: GroupRecord[] = [];
  for (const r of rawRecords) {
    const o = r as Record<string, unknown>;
    const idxs = Array.isArray(o.image_indexes)
      ? (o.image_indexes as unknown[])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0 && n < imageCount)
      : [];
    const section = str(o.section);
    const docType = str(o.document_type);
    const smart =
      o.smart_section === "diet" || o.smart_section === "bills" ? o.smart_section : null;
    records.push({
      title: str(o.title) || "Untitled",
      document_type:
        docType && (VALID_DOC_TYPES as readonly string[]).includes(docType) ? docType : "unknown",
      section: section && (VALID_SECTIONS as readonly string[]).includes(section) ? section : null,
      smart_section: smart,
      summary: str(o.summary),
      merchant: str(o.merchant),
      amount_value: str(o.amount_value),
      amount_currency: str(o.amount_currency),
      occurred_at: str(o.occurred_at),
      location: str(o.location),
      confidence: typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : 0.5,
      image_indexes: idxs.length ? Array.from(new Set(idxs)) : [],
    });
  }
  if (records.length === 0) return null;
  // The user already decided these are one thing: collapse to a single record.
  if (forceMerge) {
    return { merged: true, reason: str(p.reason) ?? "forced merge", records: [foldToOne(records)] };
  }
  // Otherwise "merged" only holds if the model returned exactly one record.
  const merged = p.merged === true && records.length === 1;
  return { merged, reason: str(p.reason) ?? "", records };
}

/**
 * One multimodal Infra-AI call over a whole image set. Returns the
 * classification (one-entity vs many) AND the record(s), or null if the model
 * is unavailable / unparseable (caller falls back to per-image extraction).
 */
export async function extractImageGroup(
  images: GroupImage[],
  opts: { language?: string | null; forceMerge?: boolean } = {},
): Promise<GroupExtraction | null> {
  if (images.length === 0) return null;

  const content: ContentPart[] = [];
  images.forEach((im, i) => {
    content.push({ type: "text", text: `Image ${i}: ${im.filename}` });
    content.push({ type: "image", mimeType: im.mimeType, dataBase64: im.dataBase64 });
  });
  content.push({
    type: "text",
    text: `${images.length} images, dropped together. ${
      opts.forceMerge
        ? "The user has confirmed these are ONE thing: return exactly one record (merged=true) whose image_indexes cover every image."
        : "Decide one-vs-many and return JSON."
    }${opts.language ? ` Write user-facing strings (title, summary) in ${opts.language}.` : ""}`,
  });

  const startedAt = Date.now();
  try {
    const res = await infraComplete(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
      {
        tier: "premium",
        maxTokens: 2000,
        onUsage: (u) =>
          recordAiCall({
            surface: "upload-group-extract",
            model: u.model,
            inputTokens: u.tokens.input,
            outputTokens: u.tokens.output,
            latencyMs: Date.now() - startedAt,
          }),
      },
    );
    if (!res?.content) return null;
    const cleaned = res.content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    return sanitize(JSON.parse(cleaned), images.length, opts.forceMerge ?? false);
  } catch {
    return null;
  }
}

export { VALID_SECTIONS, VALID_DOC_TYPES, sanitize as sanitizeGroupExtraction };
