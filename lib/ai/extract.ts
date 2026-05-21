import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import { getAnthropic } from "./anthropic";
import { estimatedCostUSD } from "./pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordSystemEvent } from "@/lib/data/system-events";
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

export type SmartSection = "diet" | "bills";

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
  // Diet-only (null on non-food items).
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  // Bills-only (null on non-bills).
  is_recurring: boolean | null;
  recurring_interval: string | null;
  // Cash-flow direction. 'outflow' = money the user paid/owes,
  // 'inflow' = money the user received. Null when not financial / ambiguous.
  direction: "inflow" | "outflow" | null;
  // Smart section routing. Extractor sets this when content is clearly
  // diet-related ("diet") or bills-related ("bills"). Auto-detected from
  // content; can also be forced by a hint from the upload page.
  smart_section: SmartSection | null;
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

const SPREADSHEET_MIME = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

// Per-file caps for the in-prompt path. These cap what we send TO Claude,
// not what we store — oversize files are still saved and searchable by
// filename + user note, just without structured extraction. The image cap
// reflects Anthropic's vision payload ceiling (~5MB per image block).
//
// MAX_SHEET_BYTES is well below the 50MB upload max because XLSX.read
// expands the workbook into JS objects in memory, which can OOM a
// Fluid Compute instance well before the file itself does. 25MB
// covers every spreadsheet we've seen in beta with headroom.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 32 * 1024 * 1024;
const MAX_TEXT_BYTES = 1 * 1024 * 1024;
const MAX_SHEET_BYTES = 25 * 1024 * 1024;
// Max characters of spreadsheet text we send to Claude in one call. Above
// this we truncate the bottom of the data so the prompt stays focused.
const MAX_SHEET_PROMPT_CHARS = 200_000;

/**
 * Reason an extraction call skipped a file. Surfaces in upload metadata so
 * the UI can show a calm "kept on file, couldn't read" message instead of
 * silently falling back. `null` here means "no skip — extraction ran".
 */
export type SkipReason =
  | "image_too_large"
  | "pdf_too_large"
  | "sheet_too_large"
  | "text_too_large"
  | "unsupported_type"
  | "model_unavailable"
  | "model_error"
  | "empty_result";

export type ExtractionOutcome =
  | { kind: "ok"; result: ExtractionResult }
  | { kind: "skipped"; reason: SkipReason };

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

BUSINESS DOCUMENTS — when the file looks operational (contract, term sheet, bank statement, transaction export, lease, board minutes, financial report), be exhaustive:
- Pull every named party, vendor, tenant, customer, counterparty into entities.people / entities.companies.
- Capture every amount with its context: rent, deposit, fee, valuation, ownership %, interest rate, recurring charge, late payment, transaction id, invoice number.
- Capture every relevant date: signing, closing, due, expiration, renewal, board meeting, transaction date.
- Note obligations, risks, and commitments in action_items when actionable, or in summary when descriptive.
- For spreadsheets and bank/transaction exports, return one item per discrete transaction or line. If hundreds of similar rows, produce a single summary item plus a few exemplar rows.

DIRECTION — set direction whenever a document moves money:
- "outflow" for money the user paid or owes: bills, supplier invoices received, purchase receipts, outgoing wire transfers, lease/rent payments.
- "inflow" for money the user received: sales invoices issued to customers, customer receipts, refunds, incoming transfers, dividend or interest income.
- null for non-financial or ambiguous documents (contracts without monetary movement, statements that contain both directions, etc.).

SMART SECTIONS — set smart_section on each item:
- "diet" when the item is food the user ate (meal photo, restaurant receipt, food description). Estimate calories, protein_g, carbs_g, fat_g as plain numbers. Be DECISIVE — a reasonable rough estimate is much more useful than null. Use both the image AND the user_description (e.g. "lunch: chicken bowl, rice, salad" → estimate ~600 cal, 45g protein, 70g carbs, 18g fat). Only leave calories null when the item genuinely contains no food cue at all. Suggest a friendly meal title like "Chicken bowl with rice and salad" and set occurred_at to when the meal happened — use the upload time if no other timestamp is visible (the meal page slices by occurred_at, so an unset value means it won't appear in "Today").
- "bills" when the item is a bill or invoice the user owes or paid (utility, rent, subscription, recurring service). Pull amount + currency + occurred_at (use the DUE DATE if visible, otherwise the issue/payment date). Detect recurrence: set is_recurring=true and recurring_interval ("monthly" / "quarterly" / "yearly" / "weekly") when the bill clearly recurs. Leave is_recurring null when uncertain.
- null when the item is neither (a contract, photo, note, generic receipt that isn't a household bill).

CALENDAR / EVENT DATES — occurred_at is what the Calendar and reminder system read. It should always represent the NEXT actionable moment for the item, not the moment the document was created:
- For boarding passes, tickets, itineraries, and reservations, occurred_at MUST be the EVENT date and time (the flight time, the show time, the hotel check-in), NOT the booking date or issue date.
- For invoices and bills, occurred_at is the DUE DATE when visible. If only an issue date is present and the bill is recurring, use the next expected due date.
- For leases and rental agreements, occurred_at is the LEASE EXPIRATION date or the next renewal/break-clause date — NOT the signing date. If only the signing date is present and the term is stated (e.g. "12-month lease starting Jan 1, 2026"), compute the expiration.
- For contracts and agreements, occurred_at is the EXPIRATION or NEXT RENEWAL date when stated. If neither is visible, leave it null and put the signing date in entities.dates instead.
- For insurance policies, occurred_at is the RENEWAL date (when the policy needs to be re-paid or re-bound). The effective-from date goes in entities.dates.
- For subscriptions and recurring services, occurred_at is the NEXT CHARGE date.
- For receipts of past purchases, occurred_at is the purchase date/time.
- For meal photos, occurred_at is when the meal was eaten (often = upload time).
- If you cannot infer the right date, leave occurred_at null. Don't guess wildly — better empty than wrong.

USER CONTEXT may be provided alongside the file. It's a free-form note the user typed before uploading (e.g. "Lunch: chicken, rice, salad" or "Electricity bill for LA apartment"). Use it to:
- Disambiguate when the image is unclear.
- Override smart_section when the user clearly meant diet or bills.
- Improve title / merchant / category accuracy.

SMART_SECTION_HINT may also be provided. If set to "diet" or "bills", treat the file as that kind unless the content clearly says otherwise (e.g. don't classify a contract as a meal just because the hint says diet).

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
    smart_section: {
      type: ["string", "null"],
      enum: ["diet", "bills", null],
      description:
        "Routes this item to a Smart Section: 'diet' for food, 'bills' for bills/invoices, null otherwise.",
    },
    calories: {
      type: ["number", "null"],
      description:
        "Best-effort calorie estimate (kcal). Diet items only. Null when unknown.",
    },
    protein_g: {
      type: ["number", "null"],
      description: "Grams of protein. Diet items only. Null when unknown.",
    },
    carbs_g: {
      type: ["number", "null"],
      description: "Grams of carbs. Diet items only. Null when unknown.",
    },
    fat_g: {
      type: ["number", "null"],
      description: "Grams of fat. Diet items only. Null when unknown.",
    },
    is_recurring: {
      type: ["boolean", "null"],
      description:
        "True when this looks like a recurring bill (electricity, rent, subscription). Bills only. Null when uncertain.",
    },
    recurring_interval: {
      type: ["string", "null"],
      description:
        "Cadence label when is_recurring is true: 'monthly' / 'quarterly' / 'yearly' / 'weekly'. Null otherwise.",
    },
    direction: {
      type: ["string", "null"],
      enum: ["inflow", "outflow", null],
      description:
        "Cash-flow direction: 'outflow' for money the user paid or owes (bills received, purchase receipts, outgoing transfers), 'inflow' for money received (sales invoices issued, customer receipts, refunds, incoming transfers). Null for non-financial items or when ambiguous.",
    },
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
  /** Free-form note the user typed before uploading. Improves disambiguation. */
  userDescription?: string | null;
  /** Forces classification into Diet/Bills when the user uploaded via those pages. */
  smartSectionHint?: SmartSection | null;
}): Promise<ExtractionOutcome> {
  const client = getAnthropic();
  if (!client) return { kind: "skipped", reason: "model_unavailable" };

  const mime = input.mimeType ?? "";

  const admin = createAdminClient();
  const { data: blob, error } = await admin.storage
    .from("uploads")
    .download(input.storagePath);
  if (error || !blob) return { kind: "skipped", reason: "model_error" };
  const buffer = Buffer.from(await blob.arrayBuffer());

  const contextLines: string[] = [`Filename: ${input.filename}`];
  if (input.userDescription) {
    contextLines.push(`User context: ${input.userDescription}`);
  }
  if (input.smartSectionHint) {
    contextLines.push(`Smart section hint: ${input.smartSectionHint}`);
  }
  const contextHeader = contextLines.join("\n");

  let content: Anthropic.Messages.ContentBlockParam[];

  if (SUPPORTED_IMAGE_MIME.has(mime)) {
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return { kind: "skipped", reason: "image_too_large" };
    }
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
        text: `${contextHeader}\n\nIf there are multiple receipts/documents visible, return one item per receipt. Call store_extraction.`,
      },
    ];
  } else if (mime === "application/pdf") {
    if (buffer.byteLength > MAX_PDF_BYTES) {
      return { kind: "skipped", reason: "pdf_too_large" };
    }
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
        text: `${contextHeader}\n\nReturn one item per discrete document in the PDF. Call store_extraction.`,
      },
    ];
  } else if (SPREADSHEET_MIME.has(mime)) {
    if (buffer.byteLength > MAX_SHEET_BYTES) {
      return { kind: "skipped", reason: "sheet_too_large" };
    }
    const text = spreadsheetToText(buffer);
    if (!text) return { kind: "skipped", reason: "model_error" };
    content = [
      {
        type: "text",
        text: `${contextHeader}\n\nSpreadsheet contents (rendered as CSV-like text, one section per sheet):\n${text}\n\nReturn one item per meaningful row when rows are discrete transactions / line items / contracts. If hundreds of similar rows, group sensibly. Call store_extraction.`,
      },
    ];
  } else if (mime.startsWith("text/") || mime === "text/csv") {
    if (buffer.byteLength > MAX_TEXT_BYTES) {
      return { kind: "skipped", reason: "text_too_large" };
    }
    const text = buffer.toString("utf8");
    content = [
      {
        type: "text",
        text: `${contextHeader}\n\nDocument contents:\n${text}\n\nCall store_extraction with one or more items.`,
      },
    ];
  } else {
    // Unsupported type (e.g. docx, pptx, audio). File still on storage,
    // user can search by name + note.
    return { kind: "skipped", reason: "unsupported_type" };
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
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    void recordSystemEvent({
      kind: "ai.error",
      severity: "error",
      message: err.message ?? "Anthropic messages.create threw",
      context: {
        surface: "extract",
        model: getExtractionModel(),
        statusCode: err.status,
        name: err.name,
        filename: input.filename,
      },
    });
    return { kind: "skipped", reason: "model_error" };
  }

  // Capture usage so the admin page can show real numbers.
  if (response.usage) {
    void recordSystemEvent({
      kind: "ai.request",
      severity: "info",
      message: "extract",
      context: {
        surface: "extract",
        model: response.model,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cost_usd: estimatedCostUSD(
          response.model,
          response.usage.input_tokens,
          response.usage.output_tokens,
        ),
      },
    });
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) return { kind: "skipped", reason: "empty_result" };

  const result = normalize(
    toolUse.input as Record<string, unknown>,
    response.model,
  );
  if (result.items.length === 0) {
    return { kind: "skipped", reason: "empty_result" };
  }
  return { kind: "ok", result };
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

  const smart_section: SmartSection | null =
    raw.smart_section === "diet" || raw.smart_section === "bills"
      ? (raw.smart_section as SmartSection)
      : null;
  const calories = typeof raw.calories === "number" ? raw.calories : null;
  const protein_g = typeof raw.protein_g === "number" ? raw.protein_g : null;
  const carbs_g = typeof raw.carbs_g === "number" ? raw.carbs_g : null;
  const fat_g = typeof raw.fat_g === "number" ? raw.fat_g : null;
  const is_recurring =
    typeof raw.is_recurring === "boolean" ? raw.is_recurring : null;
  const recurring_interval =
    typeof raw.recurring_interval === "string" ? raw.recurring_interval : null;
  const direction: "inflow" | "outflow" | null =
    raw.direction === "inflow" || raw.direction === "outflow"
      ? (raw.direction as "inflow" | "outflow")
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
    calories,
    protein_g,
    carbs_g,
    fat_g,
    is_recurring,
    recurring_interval,
    direction,
    smart_section,
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

/**
 * Render an XLSX/XLS workbook as concatenated CSV-like text so we can feed
 * it to Claude as a single text content block. One CSV section per sheet,
 * truncated to MAX_SHEET_PROMPT_CHARS so the prompt window stays focused
 * on the head of the data.
 */
function spreadsheetToText(buffer: Buffer): string | null {
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      parts.push(`# Sheet: ${name}`);
      parts.push(XLSX.utils.sheet_to_csv(sheet));
    }
    const joined = parts.join("\n\n");
    if (joined.length <= MAX_SHEET_PROMPT_CHARS) return joined;
    return (
      joined.slice(0, MAX_SHEET_PROMPT_CHARS) +
      "\n\n…(spreadsheet truncated; let the user know if you'd need more rows.)"
    );
  } catch {
    return null;
  }
}
