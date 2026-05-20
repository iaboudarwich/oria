import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  AUTO_FILE_CONFIDENCE,
  extractFromUpload,
  type ExtractionResult,
} from "@/lib/ai/extract";
import type { DocumentType, Section } from "@/lib/supabase/types";

/**
 * Upload intelligence pipeline.
 *
 * Today the implementation is a heuristic classifier driven by the filename
 * and mime type. It is honest: only the things it can reliably infer from
 * those signals are written. Richer fields (raw_text, totals, dates,
 * full entity sets) appear once real OCR / vision is wired into
 * `runStubExtractor`.
 *
 * Schema: see supabase/migrations/0004 + 0005. The contract between this
 * module and the UI is the `extractions` row + the mirrored fields on
 * `uploads` (document_type, language, is_handwritten, section).
 *
 * Languages targeted at the model layer (when wired):
 *   en, fr, ar, es, de, it, pt, ru, zh, ja
 * Handwritten en / fr / ar are first-class targets.
 */

type Classification = {
  document_type: DocumentType;
  suggested_section: Section | null;
  detected_people: string[];
};

const SECTION_HINTS: { [k in DocumentType]?: Section } = {
  receipt: "finance",
  invoice: "finance",
  boarding_pass: "travel",
  ticket: "travel",
  itinerary: "travel",
  contract: "legal",
  form: "legal",
  schedule: "household",
  handwritten_note: "personal",
  sticky_note: "personal",
  business_card: "personal",
  scanned_document: "personal",
  screenshot: "personal",
  photo: "personal",
  resume: "personal",
};

/* ---------------------------------------------------------------------- */
/* Filename heuristics                                                      */
/* ---------------------------------------------------------------------- */

const RESUME_ANCHOR =
  /\b(resume|cv|curriculum\s*vitae|hoja\s+de\s+vida|lebenslauf|curriculo|curriculum)\b/i;

const RECEIPT_RE = /\b(receipt|recu|reçu|recibo|quittance)\b/i;
const INVOICE_RE = /\b(invoice|facture|factura|rechnung|fattura|fatura)\b/i;
const BOARDING_RE = /\b(boarding|bp|boardingpass|carte\s*d['']embarquement)\b/i;
const TICKET_RE = /\b(ticket|billet|entrada|biglietto)\b/i;
const CONTRACT_RE = /\b(contract|contrat|contrato|nda|agreement|vertrag)\b/i;
const ITINERARY_RE = /\b(itinerary|itineraire|itinerario)\b/i;
const SCHEDULE_RE = /\b(schedule|emploi[- ]du[- ]temps|horario|programa)\b/i;
const FORM_RE = /\b(form|formulaire|formulario|antrag)\b/i;
const NOTE_RE = /\b(note|memo|notes)\b/i;
const CARD_RE = /\b(card|carte|tarjeta|visitenkarte)\b/i;
const SCREENSHOT_RE = /\b(screenshot|screen|capture)\b/i;
const SCAN_RE = /\bscan\b/i;

/** Strip extension, normalize separators, strip year/version tokens. */
function normalizeFilename(filename: string): string {
  let s = filename.replace(/\.[^.]+$/, ""); // strip extension
  s = s.replace(/[_\-.]+/g, " ");
  s = s.replace(/['']?\s*\d{2}\b/g, " "); // '26 style years
  s = s.replace(/\b(?:19|20)\d{2}\b/g, " "); // full years
  s = s.replace(/\b(?:v\d+|final|draft|copy|rev\d*)\b/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const NAME_STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "for", "to", "with", "by",
  "my", "your", "their", "his", "her",
]);

function titleCase(word: string): string {
  if (word.length === 0) return word;
  // Keep all-caps short tokens as-is (e.g. "NYC", "USA")
  if (word.length <= 3 && word === word.toUpperCase()) return word;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Try to pull a person's name out of a filename. Looks for an anchor word
 * (resume / cv / etc.) and takes the longest plausible name on either side.
 * Returns null if the result doesn't look like a name (too short, too long,
 * mostly digits, or made of stopwords).
 */
function detectPersonInFilename(filename: string): string | null {
  const normalized = normalizeFilename(filename);
  const m = normalized.match(RESUME_ANCHOR);
  if (!m || m.index === undefined) return null;

  const before = normalized.slice(0, m.index).trim();
  const after = normalized.slice(m.index + m[0].length).trim();
  const candidate = before.length >= after.length ? before : after;

  const tokens = candidate
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{M}'-]/gu, ""))
    .filter((t) => t.length > 1 && !NAME_STOPWORDS.has(t.toLowerCase()));

  if (tokens.length < 1 || tokens.length > 5) return null;
  // Must contain at least one alphabetic-looking token
  if (!tokens.some((t) => /\p{L}/u.test(t))) return null;

  return tokens.map(titleCase).join(" ");
}

function classify(file: {
  filename: string;
  mime_type: string | null;
}): Classification {
  const name = file.filename;
  const mime = file.mime_type ?? "";

  let document_type: DocumentType = "unknown";
  let detected_people: string[] = [];

  if (RESUME_ANCHOR.test(name)) {
    document_type = "resume";
    const person = detectPersonInFilename(name);
    if (person) detected_people = [person];
  } else if (RECEIPT_RE.test(name)) document_type = "receipt";
  else if (INVOICE_RE.test(name)) document_type = "invoice";
  else if (BOARDING_RE.test(name)) document_type = "boarding_pass";
  else if (TICKET_RE.test(name)) document_type = "ticket";
  else if (CONTRACT_RE.test(name)) document_type = "contract";
  else if (ITINERARY_RE.test(name)) document_type = "itinerary";
  else if (SCHEDULE_RE.test(name)) document_type = "schedule";
  else if (FORM_RE.test(name)) document_type = "form";
  else if (NOTE_RE.test(name)) document_type = "handwritten_note";
  else if (CARD_RE.test(name)) document_type = "business_card";
  else if (SCREENSHOT_RE.test(name)) document_type = "screenshot";
  else if (SCAN_RE.test(name)) document_type = "scanned_document";
  else if (mime.startsWith("image/")) document_type = "photo";

  return {
    document_type,
    suggested_section: SECTION_HINTS[document_type] ?? null,
    detected_people,
  };
}

/**
 * Run the processing pipeline for an upload. Safe to fire-and-forget.
 * On failure, marks the upload as failed but never throws to the caller.
 *
 * Strategy:
 *   1. Mark the upload "processing" so the UI can show a quiet indicator.
 *   2. Try Claude vision/document extraction first. When it succeeds we
 *      have the real content (raw_text, entities, dates, amounts, action
 *      items, summary, confidence), and we use that to set section + title.
 *   3. Fall back to the filename heuristic when the extractor isn't
 *      available (no API key, unsupported mime, oversized file, API error).
 *      Heuristic-only signal is honest: we don't fabricate a confidence.
 *   4. Always insert an extractions row so Ask Oria can see it. Always
 *      mark the upload "filed" at the end, even when we landed in Unsorted.
 *   5. Suggest a reminder for document types that almost always need one.
 */
export async function processUpload(uploadId: string): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from("uploads")
    .update({ status: "processing" })
    .eq("id", uploadId);

  const { data, error: readError } = await supabase
    .from("uploads")
    .select(
      "id, filename, mime_type, section, custom_section_id, title, storage_path, organization_id",
    )
    .eq("id", uploadId)
    .maybeSingle();
  const upload = data as {
    id: string;
    filename: string;
    mime_type: string | null;
    section: Section | null;
    custom_section_id: string | null;
    title: string | null;
    storage_path: string;
    organization_id: string;
  } | null;

  if (readError || !upload) {
    await supabase.from("uploads").update({ status: "failed" }).eq("id", uploadId);
    return;
  }

  const aiResult = await extractFromUpload({
    storagePath: upload.storage_path,
    mimeType: upload.mime_type,
    filename: upload.filename,
  }).catch(() => null);

  const heuristic = classify({
    filename: upload.filename,
    mime_type: upload.mime_type,
  });

  // ----- AI path: one or more memory_items ----------------------------------
  if (aiResult && aiResult.items.length > 0) {
    const itemRows = aiResult.items.map((item) => {
      const autoSection =
        item.confidence >= AUTO_FILE_CONFIDENCE ? item.suggested_section : null;
      return {
        organization_id: upload.organization_id,
        upload_id: upload.id,
        document_type: item.document_type,
        section: autoSection,
        language: item.language,
        is_handwritten: item.is_handwritten,
        confidence: item.confidence,
        title: item.title,
        summary: item.summary,
        merchant: item.merchant,
        amount_value: item.amount_value,
        amount_currency: item.amount_currency,
        amount_normalized: item.amount_normalized,
        occurred_at: item.occurred_at,
        location: item.location,
        payment_method: item.payment_method,
        category: item.category,
        items_purchased: item.items_purchased,
        raw_text: item.raw_text || null,
        entities: item.entities,
        facts: {
          action_items: item.action_items,
          suggested_section: item.suggested_section,
        },
      };
    });
    await supabase.from("memory_items").insert(itemRows);

    const dominantType = aiResult.items[0].document_type;
    const dominantLanguage = aiResult.items[0].language;
    const anyHandwritten = aiResult.items.some((i) => i.is_handwritten);
    const isSingle = aiResult.items.length === 1;
    const single = aiResult.items[0];
    const singleAutoSection =
      isSingle && single.confidence >= AUTO_FILE_CONFIDENCE
        ? single.suggested_section
        : null;
    const newTitle =
      isSingle && single.title
        ? single.title
        : aiResult.items.length > 1
          ? multiItemTitle(aiResult.items)
          : null;

    await supabase.from("extractions").insert(
      extractionFromAi(upload.id, aiResult, dominantType, dominantLanguage),
    );

    await supabase
      .from("uploads")
      .update({
        status: "filed",
        document_type: dominantType,
        ...(singleAutoSection && !upload.section
          ? { section: singleAutoSection }
          : {}),
        ...(newTitle && (!upload.title || upload.title === upload.filename)
          ? { title: newTitle }
          : {}),
        ...(dominantLanguage ? { language: dominantLanguage } : {}),
        is_handwritten: anyHandwritten,
      })
      .eq("id", uploadId);

    // Calendar surfaces memory_items.occurred_at directly now — we no longer
    // auto-create generic "Check this itinerary"-style reminders.
    return;
  }

  // ----- Heuristic fallback (no AI available) -------------------------------
  await supabase
    .from("extractions")
    .insert(extractionFromHeuristic(upload.id, heuristic));

  const heuristicTitle =
    heuristic.document_type === "resume" && heuristic.detected_people[0]
      ? `${heuristic.detected_people[0]}, resume`
      : null;

  let matchedCustomSectionId: string | null = null;
  if (
    !heuristic.suggested_section &&
    !upload.section &&
    !upload.custom_section_id
  ) {
    matchedCustomSectionId = await matchCustomSection(
      upload.filename,
      upload.organization_id,
    );
  }

  await supabase
    .from("uploads")
    .update({
      status: "filed",
      document_type: heuristic.document_type,
      ...(heuristic.suggested_section && !upload.section
        ? { section: heuristic.suggested_section }
        : {}),
      ...(matchedCustomSectionId
        ? { custom_section_id: matchedCustomSectionId }
        : {}),
      ...(heuristicTitle && (!upload.title || upload.title === upload.filename)
        ? { title: heuristicTitle }
        : {}),
    })
    .eq("id", uploadId);
}

function multiItemTitle(items: ExtractionResult["items"]): string {
  const merchants = items
    .map((i) => i.merchant)
    .filter((m): m is string => !!m)
    .slice(0, 3);
  if (merchants.length === 0) return `${items.length} items`;
  const more = items.length - merchants.length;
  const list = merchants.join(", ");
  return more > 0 ? `${list} +${more} more` : list;
}

type ExtractionInsert = {
  upload_id: string;
  document_type: DocumentType;
  language: string | null;
  secondary_languages: string[];
  is_handwritten: boolean | null;
  script_hints: string[];
  raw_text: string | null;
  facts: Record<string, unknown>;
  entities: Record<string, unknown>;
  action_items: string[];
  confidence: number | null;
  processor: string;
};

function extractionFromAi(
  uploadId: string,
  ai: ExtractionResult,
  documentType: DocumentType,
  language: string | null,
): ExtractionInsert {
  // Join raw_text from every item so the per-file extraction row remains a
  // useful searchable blob even if no one queries memory_items directly.
  const raw_text = ai.items
    .map((i) => i.raw_text)
    .filter(Boolean)
    .join("\n\n---\n\n");
  const allEntities = ai.items.reduce(
    (acc, i) => {
      acc.people.push(...i.entities.people);
      acc.locations.push(...i.entities.locations);
      acc.companies.push(...i.entities.companies);
      acc.amounts.push(...i.entities.amounts);
      acc.dates.push(...i.entities.dates);
      return acc;
    },
    {
      people: [] as string[],
      locations: [] as string[],
      companies: [] as string[],
      amounts: [] as Array<{ value: string; currency?: string; context?: string }>,
      dates: [] as Array<{ value: string; iso?: string; context?: string }>,
    },
  );
  return {
    upload_id: uploadId,
    document_type: documentType,
    language,
    secondary_languages: Array.from(
      new Set(ai.items.flatMap((i) => i.secondary_languages)),
    ),
    is_handwritten: ai.items.some((i) => i.is_handwritten),
    script_hints: [],
    raw_text: raw_text || null,
    facts: {
      items_count: ai.items.length,
      source_quality_notes: ai.source_quality_notes,
      items_summary: ai.items.map((i) => ({
        title: i.title,
        merchant: i.merchant,
        amount: i.amount_value,
        currency: i.amount_currency,
        section: i.suggested_section,
        confidence: i.confidence,
      })),
    },
    entities: allEntities,
    action_items: ai.items.flatMap((i) => i.action_items),
    confidence:
      ai.items.reduce((acc, i) => acc + i.confidence, 0) / ai.items.length,
    processor: ai.processor,
  };
}

function extractionFromHeuristic(
  uploadId: string,
  heuristic: Classification,
): ExtractionInsert {
  return {
    upload_id: uploadId,
    document_type: heuristic.document_type,
    language: null,
    secondary_languages: [],
    is_handwritten: null,
    script_hints: [],
    raw_text: null,
    facts: {},
    entities:
      heuristic.detected_people.length > 0
        ? { people: heuristic.detected_people }
        : {},
    action_items: [],
    confidence: null,
    processor: "heuristic-v2",
  };
}

/**
 * Try to match an upload against the user's custom sections using
 * the section name + the profile.kinds + profile.related fields.
 * Returns the matched section's id, or null.
 *
 * This is intentionally a simple substring scan today. It is the seam where a
 * real model would score embeddings of the section profile vs. the upload's
 * extracted text.
 */
async function matchCustomSection(
  filename: string,
  organizationId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("custom_sections")
    .select("id, name, profile")
    .eq("organization_id", organizationId);

  const haystack = filename.toLowerCase();

  type Row = { id: string; name: string; profile: unknown };
  const rows = (data ?? []) as Row[];

  for (const sec of rows) {
    const profile = (sec.profile && typeof sec.profile === "object"
      ? (sec.profile as Record<string, unknown>)
      : {}) as { kinds?: unknown; related?: unknown };

    const keywords: string[] = [sec.name.toLowerCase()];

    if (Array.isArray(profile.kinds)) {
      for (const k of profile.kinds) keywords.push(String(k).toLowerCase());
    }
    if (typeof profile.related === "string") {
      for (const r of profile.related.split(/[,;]/)) {
        const v = r.trim().toLowerCase();
        if (v.length >= 3) keywords.push(v);
      }
    }

    for (const kw of keywords) {
      if (kw.length >= 2 && haystack.includes(kw)) {
        return sec.id;
      }
    }
  }
  return null;
}


/**
 * Latest extraction for an upload (null if no pass has run).
 */
export async function getLatestExtraction(uploadId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("extractions")
    .select("*")
    .eq("upload_id", uploadId)
    .order("processed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as import("@/lib/supabase/types").Extraction | null;
}

/* ---------------------------------------------------------------------- */
/* Display helpers used by the UI                                          */
/* ---------------------------------------------------------------------- */

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  receipt: "Receipt",
  invoice: "Invoice",
  boarding_pass: "Boarding pass",
  ticket: "Ticket",
  contract: "Contract",
  itinerary: "Itinerary",
  schedule: "Schedule",
  form: "Form",
  handwritten_note: "Handwritten note",
  sticky_note: "Sticky note",
  screenshot: "Screenshot",
  photo: "Photo",
  scanned_document: "Scanned document",
  business_card: "Business card",
  resume: "Resume",
  unknown: "Document",
};

/** Query-term aliases used by search. "CV" → resume, "bill" → invoice, etc. */
export const TYPE_ALIASES: Record<string, DocumentType[]> = {
  resume: ["resume"],
  cv: ["resume"],
  "curriculum vitae": ["resume"],
  receipt: ["receipt"],
  invoice: ["invoice"],
  bill: ["invoice"],
  contract: ["contract"],
  agreement: ["contract"],
  nda: ["contract"],
  ticket: ["ticket"],
  "boarding pass": ["boarding_pass"],
  boarding: ["boarding_pass"],
  itinerary: ["itinerary"],
  schedule: ["schedule"],
  form: ["form"],
  note: ["handwritten_note", "sticky_note"],
  notes: ["handwritten_note", "sticky_note"],
  card: ["business_card"],
  "business card": ["business_card"],
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  ar: "Arabic",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
};

export function languageName(code: string | null): string | null {
  if (!code) return null;
  const k = code.toLowerCase().slice(0, 2);
  return LANGUAGE_NAMES[k] ?? code.toUpperCase();
}

/* ---------------------------------------------------------------------- */
/* JSON helpers for rendering structured facts/entities                    */
/* ---------------------------------------------------------------------- */

export type FactRow = { key: string; label: string; value: string };

const FACT_LABELS: Record<string, string> = {
  total: "Total",
  amount: "Amount",
  currency: "Currency",
  merchant: "Merchant",
  date: "Date",
  due_date: "Due",
  airline: "Airline",
  flight_no: "Flight",
  from: "From",
  to: "To",
  departure: "Departure",
  arrival: "Arrival",
  seat: "Seat",
  parties: "Parties",
  effective_date: "Effective",
  expires_at: "Expires",
  reference: "Reference",
  invoice_no: "Invoice no.",
};

export function factsToRows(facts: unknown): FactRow[] {
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) return [];
  const out: FactRow[] = [];
  for (const [key, raw] of Object.entries(facts as Record<string, unknown>)) {
    if (raw === null || raw === undefined || raw === "") continue;
    const value = Array.isArray(raw)
      ? raw.join(", ")
      : typeof raw === "object"
        ? JSON.stringify(raw)
        : String(raw);
    out.push({
      key,
      label:
        FACT_LABELS[key] ??
        key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      value,
    });
  }
  return out;
}

export type EntityGroup = { label: string; items: string[] };

const ENTITY_LABELS: Record<string, string> = {
  people: "People",
  organizations: "Organizations",
  locations: "Places",
  dates: "Dates",
};

export function entitiesToGroups(entities: unknown): EntityGroup[] {
  if (!entities || typeof entities !== "object" || Array.isArray(entities)) return [];
  const out: EntityGroup[] = [];
  for (const [key, raw] of Object.entries(entities as Record<string, unknown>)) {
    if (!Array.isArray(raw) || raw.length === 0) continue;
    out.push({
      label: ENTITY_LABELS[key] ?? key,
      items: raw.map((x) => String(x)).filter(Boolean),
    });
  }
  return out;
}
