import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DocumentType, Section } from "@/lib/supabase/types";

/**
 * Oria's document intelligence engine.
 *
 * Each upload can carry MORE THAN ONE thing (a photo of three receipts on a
 * table, a scan with two invoices, a notebook page with several notes). The
 * extractor returns a list of `ExtractedItem`s, one per discrete piece of
 * information, plus a few image-level notes.
 *
 * Pipeline:
 *   1. Download the upload from Supabase storage (service-role client).
 *   2. Dispatch by mime: image → vision block, PDF → document block,
 *      text → inline text. Anything else returns null.
 *   3. Call Claude with a forced tool-use schema so the model is required
 *      to produce a clean JSON object. No "respond with JSON" prayer.
 *   4. Validate + normalise + return.
 *
 * Image enhancement (deblur, contrast, rotation) is not implemented yet;
 * Claude's vision is robust enough for many real-world conditions and we
 * surface `image_quality_notes` when extraction was hard. That field is the
 * seam where a future preprocessor will plug in.
 */

export type ExtractionEntities = {
  people: string[];
  locations: string[];
  companies: string[];
  amounts: Array<{ value: string; currency?: string; context?: string }>;
  dates: Array<{ value: string; iso?: string; context?: string }>;
};

export type ExtractedItem = {
  title: string;
  document_type: DocumentType;
  language: string | null;
  secondary_languages: string[];
  is_handwritten: boolean;
  raw_text: string;
  summary: string | null;
  // Structured fields for receipts / invoices / payments.
  merchant: string | null;
  amount_value: string | null;
  amount_currency: string | null;
  amount_normalized: number | null;
  occurred_at: string | null; // ISO 8601 when unambiguous
  location: string | null;
  payment_method: string | null;
  category: string | null;
  items_purchased: string[];
  // Universal
  entities: ExtractionEntities;
  action_items: string[];
  suggested_section: Section | null;
  confidence: number;
};

export type ExtractionResult = {
  source_quality_notes: string | null;
  items: ExtractedItem[];
  processor: string;
};

const DOCUMENT_TYPES: DocumentType[] = [
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
];

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

const SUPPORTED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_BYTES = 256 * 1024;

const SYSTEM_PROMPT = `You are Oria's document intelligence engine.

Read the attached file carefully and extract every distinct piece of information so the user can search and ask about it later.

CRITICAL: If the file contains multiple receipts, invoices, or documents laid out together (e.g. a photo of three receipts on a table, a scan with two invoices), return ONE item per receipt/document. Do not merge them. A photo with five receipts should produce five items.

For each item:
- Read in the original language; do not translate.
- Treat handwriting the same as typed text; set is_handwritten=true if any.
- Pull the merchant/vendor (for receipts/invoices), the total amount with currency, the transaction date/time, location, payment method, and any line items.
- Suggest the best section. If you're not sure, set suggested_section to null and confidence below 0.6.
- Suggest a short human title, e.g. "Spinneys, Feb 12 — 47.20 USD" or "Hermès invoice, Beirut — 1,250 EUR".
- Pick a category in your own words: "groceries", "fashion / luxury shopping", "money transfer", "household maintenance", "fuel", etc.
- Confidence (0..1) reflects how cleanly you read this specific item.

If the image is blurry, dark, partial, or tilted, describe what's wrong in source_quality_notes and still do your best on each item.

You MUST call the store_extraction tool with your findings. Do not output free-form text.`;

const ITEM_SCHEMA: Anthropic.Messages.Tool["input_schema"] = {
  type: "object",
  properties: {
    title: { type: "string" },
    document_type: { type: "string", enum: DOCUMENT_TYPES },
    language: { type: ["string", "null"] },
    secondary_languages: { type: "array", items: { type: "string" } },
    is_handwritten: { type: "boolean" },
    raw_text: { type: "string" },
    summary: { type: ["string", "null"] },
    merchant: { type: ["string", "null"] },
    amount_value: {
      type: ["string", "null"],
      description: "Total amount as written, preserving punctuation.",
    },
    amount_currency: {
      type: ["string", "null"],
      description: "ISO currency code when possible: USD, EUR, LBP, AED…",
    },
    amount_normalized: {
      type: ["number", "null"],
      description: "Best-effort numeric for sums and comparisons.",
    },
    occurred_at: {
      type: ["string", "null"],
      description:
        "ISO 8601 datetime of the transaction/event, when unambiguous.",
    },
    location: { type: ["string", "null"] },
    payment_method: { type: ["string", "null"] },
    category: {
      type: ["string", "null"],
      description:
        "Free-form human category, e.g. 'groceries', 'luxury shopping', 'money transfer'.",
    },
    items_purchased: { type: "array", items: { type: "string" } },
    entities: {
      type: "object",
      properties: {
        people: { type: "array", items: { type: "string" } },
        locations: { type: "array", items: { type: "string" } },
        companies: { type: "array", items: { type: "string" } },
        amounts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              currency: { type: "string" },
              context: { type: "string" },
            },
            required: ["value"],
          },
        },
        dates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              value: { type: "string" },
              iso: { type: "string" },
              context: { type: "string" },
            },
            required: ["value"],
          },
        },
      },
      required: ["people", "locations", "companies", "amounts", "dates"],
    },
    action_items: { type: "array", items: { type: "string" } },
    suggested_section: { type: ["string", "null"], enum: [...SECTIONS, null] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["title", "document_type", "raw_text", "entities", "confidence"],
};

const EXTRACTION_TOOL: Anthropic.Messages.Tool = {
  name: "store_extraction",
  description:
    "Store the structured information extracted from the document. " +
    "Each receipt/invoice/document in the file should be its own item.",
  input_schema: {
    type: "object",
    properties: {
      source_quality_notes: {
        type: ["string", "null"],
        description:
          "If the image was hard to read, briefly say why (blurry, dark, partial, tilted). Null when fine.",
      },
      items: {
        type: "array",
        minItems: 1,
        items: ITEM_SCHEMA,
      },
    },
    required: ["items"],
  } as Anthropic.Messages.Tool["input_schema"],
};

function getExtractionModel(): string {
  return (
    process.env.ANTHROPIC_EXTRACTION_MODEL ??
    process.env.ANTHROPIC_MODEL ??
    "claude-sonnet-4-6"
  );
}

export async function extractFromUpload(input: {
  storagePath: string;
  mimeType: string | null;
  filename: string;
}): Promise<ExtractionResult | null> {
  const client = getAnthropic();
  if (!client) return null;

  const mime = input.mimeType ?? "";

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage
    .from("uploads")
    .download(input.storagePath);
  if (error || !blob) return null;
  const buffer = Buffer.from(await blob.arrayBuffer());

  let content: Anthropic.Messages.ContentBlockParam[];

  if (SUPPORTED_IMAGE_MIME.has(mime)) {
    if (buffer.byteLength > MAX_IMAGE_BYTES) return null;
    content = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: mime as
            | "image/png"
            | "image/jpeg"
            | "image/gif"
            | "image/webp",
          data: buffer.toString("base64"),
        },
      },
      {
        type: "text",
        text: `Filename: ${input.filename}\n\nIf there are multiple receipts/documents visible, return one item per receipt. Call store_extraction.`,
      },
    ];
  } else if (mime === "application/pdf") {
    if (buffer.byteLength > MAX_PDF_BYTES) return null;
    content = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buffer.toString("base64"),
        },
      },
      {
        type: "text",
        text: `Filename: ${input.filename}\n\nReturn one item per discrete document in the PDF. Call store_extraction.`,
      },
    ];
  } else if (mime.startsWith("text/")) {
    if (buffer.byteLength > MAX_TEXT_BYTES) return null;
    const text = buffer.toString("utf8");
    content = [
      {
        type: "text",
        text: `Filename: ${input.filename}\n\nDocument contents:\n${text}\n\nCall store_extraction with one or more items.`,
      },
    ];
  } else {
    return null;
  }

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: getExtractionModel(),
      max_tokens: 6144,
      system: SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "store_extraction" },
      messages: [{ role: "user", content }],
    });
  } catch {
    return null;
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) return null;

  return normalize(toolUse.input as Record<string, unknown>, response.model);
}

/* ------------------------------------------------------------------------ */
/* Normalisation                                                             */
/* ------------------------------------------------------------------------ */

function normalize(
  raw: Record<string, unknown>,
  model: string,
): ExtractionResult {
  const source_quality_notes =
    typeof raw.source_quality_notes === "string"
      ? raw.source_quality_notes
      : null;

  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items: ExtractedItem[] = itemsRaw
    .map((it) =>
      it && typeof it === "object"
        ? normalizeItem(it as Record<string, unknown>)
        : null,
    )
    .filter((x): x is ExtractedItem => x !== null);

  return {
    source_quality_notes,
    items,
    processor: `claude:${model}`,
  };
}

function normalizeItem(raw: Record<string, unknown>): ExtractedItem | null {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) return null;

  const document_type = DOCUMENT_TYPES.includes(raw.document_type as DocumentType)
    ? (raw.document_type as DocumentType)
    : "unknown";

  const language = typeof raw.language === "string" ? raw.language : null;
  const secondary_languages = Array.isArray(raw.secondary_languages)
    ? raw.secondary_languages.filter((l): l is string => typeof l === "string")
    : [];
  const is_handwritten = Boolean(raw.is_handwritten);
  const raw_text = typeof raw.raw_text === "string" ? raw.raw_text : "";
  const summary = typeof raw.summary === "string" ? raw.summary : null;
  const merchant = typeof raw.merchant === "string" ? raw.merchant : null;
  const amount_value =
    typeof raw.amount_value === "string" ? raw.amount_value : null;
  const amount_currency =
    typeof raw.amount_currency === "string" ? raw.amount_currency : null;
  const amount_normalized =
    typeof raw.amount_normalized === "number" ? raw.amount_normalized : null;
  const occurred_at =
    typeof raw.occurred_at === "string" ? raw.occurred_at : null;
  const location = typeof raw.location === "string" ? raw.location : null;
  const payment_method =
    typeof raw.payment_method === "string" ? raw.payment_method : null;
  const category = typeof raw.category === "string" ? raw.category : null;
  const items_purchased = Array.isArray(raw.items_purchased)
    ? raw.items_purchased.filter((s): s is string => typeof s === "string")
    : [];
  const action_items = Array.isArray(raw.action_items)
    ? raw.action_items.filter((a): a is string => typeof a === "string")
    : [];
  const confidence =
    typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1
      ? raw.confidence
      : 0;
  const suggested_section =
    typeof raw.suggested_section === "string" &&
    SECTIONS.includes(raw.suggested_section as Section)
      ? (raw.suggested_section as Section)
      : null;

  return {
    title,
    document_type,
    language,
    secondary_languages,
    is_handwritten,
    raw_text,
    summary,
    merchant,
    amount_value,
    amount_currency,
    amount_normalized,
    occurred_at,
    location,
    payment_method,
    category,
    items_purchased,
    entities: normalizeEntities(raw.entities),
    action_items,
    suggested_section,
    confidence,
  };
}

function normalizeEntities(raw: unknown): ExtractionEntities {
  const empty: ExtractionEntities = {
    people: [],
    locations: [],
    companies: [],
    amounts: [],
    dates: [],
  };
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;

  const stringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const amounts = Array.isArray(r.amounts)
    ? r.amounts.flatMap((a) => {
        if (!a || typeof a !== "object") return [];
        const o = a as Record<string, unknown>;
        if (typeof o.value !== "string") return [];
        return [
          {
            value: o.value,
            ...(typeof o.currency === "string" ? { currency: o.currency } : {}),
            ...(typeof o.context === "string" ? { context: o.context } : {}),
          },
        ];
      })
    : [];

  const dates = Array.isArray(r.dates)
    ? r.dates.flatMap((d) => {
        if (!d || typeof d !== "object") return [];
        const o = d as Record<string, unknown>;
        if (typeof o.value !== "string") return [];
        return [
          {
            value: o.value,
            ...(typeof o.iso === "string" ? { iso: o.iso } : {}),
            ...(typeof o.context === "string" ? { context: o.context } : {}),
          },
        ];
      })
    : [];

  return {
    people: stringArray(r.people),
    locations: stringArray(r.locations),
    companies: stringArray(r.companies),
    amounts,
    dates,
  };
}

/** Threshold used by the upload pipeline to decide whether to auto-file. */
export const AUTO_FILE_CONFIDENCE = 0.6;
