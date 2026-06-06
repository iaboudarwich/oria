import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AUTO_FILE_CONFIDENCE,
  extractFromUpload,
  type ExtractionResult,
  type SkipReason,
} from "@/lib/ai/extract";
import { proposeAutoReminders } from "./auto-reminders";
import { recordSystemEvent } from "./system-events";
import { buildMemoryItemRows } from "./build-memory-item-rows";
import { findReusableTwinUpload, reuseRecordsFromTwin } from "./upload-reuse";
import { resolveFinalSection } from "./section-routing";
import { storeChunks } from "@/lib/embedding/store";
import { recordDedup } from "@/lib/cache/dedup";
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
  "the",
  "a",
  "an",
  "of",
  "and",
  "for",
  "to",
  "with",
  "by",
  "my",
  "your",
  "their",
  "his",
  "her",
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

function classify(file: { filename: string; mime_type: string | null }): Classification {
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
 *
 * IMPORTANT: This runs inside Next's after() callback, after the HTTP
 * response has already been sent. Cookies/headers are no longer
 * accessible at that point, so we use the service-role admin client
 * instead of the cookie-bound server client. The org/user scoping is
 * preserved by the upload row's own organization_id (which the caller
 * validated against the user's active org before we got here).
 */
export async function processUpload(uploadId: string): Promise<void> {
  const supabase = createAdminClient();

  await supabase.from("uploads").update({ status: "processing" }).eq("id", uploadId);

  const { data, error: readError } = await supabase
    .from("uploads")
    .select(
      "id, filename, mime_type, section, custom_section_id, title, storage_path, organization_id, metadata",
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
    metadata: Record<string, unknown> | null;
  } | null;

  if (readError || !upload) {
    await supabase.from("uploads").update({ status: "failed" }).eq("id", uploadId);
    void recordSystemEvent({
      kind: "upload.failed",
      severity: "error",
      message: "Could not read upload row for processing",
      context: { uploadId, supabaseError: readError?.message ?? null },
    });
    return;
  }

  // Context the user gave at upload time: the optional note + the Smart
  // Section hint (set when uploading through /dashboard/diet or /bills).
  const meta = upload.metadata ?? {};
  const userDescription = typeof meta.user_description === "string" ? meta.user_description : null;
  const smartHintRaw = typeof meta.smart_section_hint === "string" ? meta.smart_section_hint : null;
  const smartSectionHint: "diet" | "bills" | null =
    smartHintRaw === "diet" || smartHintRaw === "bills" ? (smartHintRaw as "diet" | "bills") : null;

  // ----- Idempotency guard --------------------------------------------------
  // If this upload already has an extraction row, it was processed once
  // already (AI success OR heuristic fallback both write one; a failed
  // run writes none). A stuck-recovery sweep or a double-fired after()
  // would otherwise re-download and re-bill Claude. Mark filed and stop.
  const { count: priorExtractions } = await supabase
    .from("extractions")
    .select("id", { count: "exact", head: true })
    .eq("upload_id", uploadId);
  if ((priorExtractions ?? 0) > 0) {
    await supabase
      .from("uploads")
      .update({ status: "filed" })
      .eq("id", uploadId)
      .neq("status", "filed");
    return;
  }

  // ----- Identical-content reuse --------------------------------------------
  // If the exact same bytes were already filed in THIS org, clone that
  // upload's structured records instead of paying for a fresh extraction.
  const contentHash = typeof meta.content_hash === "string" ? meta.content_hash : null;
  if (contentHash) {
    const twin = await findReusableTwinUpload(supabase, {
      organizationId: upload.organization_id,
      contentHash,
      excludeUploadId: uploadId,
    });
    if (twin) {
      const reuse = await reuseRecordsFromTwin(supabase, {
        newUploadId: uploadId,
        twinUploadId: twin.id,
        organizationId: upload.organization_id,
      }).catch(() => ({ reused: false }) as const);
      if (reuse.reused) {
        await supabase
          .from("uploads")
          .update({
            status: "filed",
            ...(reuse.documentType ? { document_type: reuse.documentType } : {}),
            ...(reuse.language ? { language: reuse.language } : {}),
            is_handwritten: reuse.isHandwritten,
            ...(reuse.title && (!upload.title || upload.title === upload.filename)
              ? { title: reuse.title }
              : {}),
          })
          .eq("id", uploadId);

        // Auto-reminders read memory_items for the upload, so they work
        // off the cloned rows just like a fresh extraction.
        await proposeAutoReminders({
          uploadId: upload.id,
          organizationId: upload.organization_id,
        }).catch(() => undefined);

        void recordSystemEvent({
          kind: "extraction.reused",
          severity: "info",
          message: "reused",
          context: {
            uploadId: upload.id,
            title: reuse.title ?? upload.title ?? upload.filename,
            reused_from: twin.id,
            items: reuse.itemCount,
          },
          organizationId: upload.organization_id,
        });
        return;
      }
    }
  }

  const aiOutcome = await extractFromUpload({
    storagePath: upload.storage_path,
    mimeType: upload.mime_type,
    filename: upload.filename,
    userDescription,
    smartSectionHint,
  }).catch((): { kind: "skipped"; reason: SkipReason } => ({
    kind: "skipped",
    reason: "model_error",
  }));

  const aiResult = aiOutcome.kind === "ok" ? aiOutcome.result : null;
  const skipReason = aiOutcome.kind === "skipped" ? aiOutcome.reason : null;

  if (skipReason) {
    void recordSystemEvent({
      kind: "extraction.skipped",
      severity: skipReason === "model_error" || skipReason === "empty_result" ? "error" : "warn",
      message: skipReason,
      context: {
        uploadId: upload.id,
        filename: upload.filename,
        mime: upload.mime_type,
      },
      organizationId: upload.organization_id,
    });
  }

  const heuristic = classify({
    filename: upload.filename,
    mime_type: upload.mime_type,
  });

  // ----- AI path: one or more memory_items ----------------------------------
  // Sorting policy (audit rules #5–#7):
  //   • The AI reads the actual file content (image / PDF / sheet / text)
  //     via extractFromUpload above. Sorting is therefore content-based,
  //     not filename-based, whenever extraction succeeds.
  //   • Per-item `suggested_section` is only adopted as the auto-section
  //     when `confidence >= AUTO_FILE_CONFIDENCE`. Below threshold the
  //     item lands in the active space's Unsorted section so the user
  //     can place it themselves.
  //   • Sections live per-org; this whole block runs against
  //     `upload.organization_id` so an upload in one space is only ever
  //     auto-filed into one of that space's own sections.
  if (aiResult && aiResult.items.length > 0) {
    // Pure mapping (org scope, section routing, diet date override) lives
    // in build-memory-item-rows so it can be unit-tested without a live
    // Supabase round-trip. See that module for the rules.
    const itemRows = buildMemoryItemRows({
      items: aiResult.items,
      organizationId: upload.organization_id,
      uploadId: upload.id,
      smartSectionHint,
      userDescription,
    });
    // Hard-fail on insert error rather than silently filing the upload.
    // The old behaviour ate RLS / cookie errors here and left uploads
    // marked "filed" with extractions present but zero memory_items.
    // sections then showed nothing for that file. Mark the upload
    // failed so stuck-recovery can retry and the user sees a Failed
    // pill instead of a misleading green check.
    const insertRes = await supabase.from("memory_items").insert(itemRows).select("id");
    if (insertRes.error || (insertRes.data ?? []).length === 0) {
      const msg = insertRes.error?.message ?? "memory_items insert returned 0 rows";
      await supabase.from("uploads").update({ status: "failed" }).eq("id", uploadId);
      void recordSystemEvent({
        kind: "upload.failed",
        severity: "error",
        message: msg,
        context: {
          uploadId: upload.id,
          stage: "memory_items_insert",
          items_attempted: itemRows.length,
        },
        organizationId: upload.organization_id,
      });
      throw new Error(`memory_items insert failed: ${msg}`);
    }

    const dominantType = aiResult.items[0].document_type;
    const dominantLanguage = aiResult.items[0].language;
    const anyHandwritten = aiResult.items.some((i) => i.is_handwritten);
    const isSingle = aiResult.items.length === 1;
    const single = aiResult.items[0];
    const singleSmart = single.smart_section ?? smartSectionHint ?? null;
    const singleAutoSection = isSingle
      ? resolveFinalSection({
          suggested: single.confidence >= AUTO_FILE_CONFIDENCE ? single.suggested_section : null,
          documentType: single.document_type,
          smartSection: singleSmart,
          sectionHint: null,
        })
      : null;
    const newTitle =
      isSingle && single.title
        ? single.title
        : aiResult.items.length > 1
          ? multiItemTitle(aiResult.items)
          : null;

    await supabase
      .from("extractions")
      .insert(extractionFromAi(upload.id, aiResult, dominantType, dominantLanguage));

    // Clear any stale `extraction_skipped` left over from a prior heuristic
    // fallback so the upload doesn't keep a "we couldn't read this" tag in
    // metadata once a re-run finally succeeded.
    const prevMeta = upload.metadata ?? {};
    const nextMeta: Record<string, unknown> = { ...prevMeta };
    delete nextMeta.extraction_skipped;
    const metaChanged = JSON.stringify(prevMeta) !== JSON.stringify(nextMeta);

    // For bills/invoices/receipts, force the parent upload's section
    // to match the routing helper (Finance) even if a prior auto-run
    // had stamped a wrong section like "travel" on a vehicle reg
    // renewal. User-driven moves use setUploadSection() and write a
    // learning event; that path is unaffected by this override since
    // setUploadSection runs on a different code path.
    const isFinancialDoc =
      singleSmart === "bills" ||
      single.document_type === "invoice" ||
      single.document_type === "receipt";
    const shouldOverrideSection = singleAutoSection && (isFinancialDoc || !upload.section);

    await supabase
      .from("uploads")
      .update({
        status: "filed",
        document_type: dominantType,
        ...(shouldOverrideSection ? { section: singleAutoSection } : {}),
        ...(newTitle && (!upload.title || upload.title === upload.filename)
          ? { title: newTitle }
          : {}),
        ...(dominantLanguage ? { language: dominantLanguage } : {}),
        is_handwritten: anyHandwritten,
        ...(metaChanged ? { metadata: nextMeta } : {}),
        ...(aiResult.extractionMethod ? { extraction_method: aiResult.extractionMethod } : {}),
        ...(aiResult.fileHash ? { file_hash: aiResult.fileHash } : {}),
      })
      .eq("id", uploadId);

    // ── Semantic chunking ──────────────────────────────────────────────────
    // Store text chunks + embeddings for semantic search (Ask Oria).
    // Fire-and-forget: a failure here never blocks the upload from filing.
    if (aiResult.rawText && aiResult.rawText.trim().length >= 100) {
      void storeChunks({
        uploadId: upload.id,
        organizationId: upload.organization_id,
        text: aiResult.rawText,
        section: upload.section ?? undefined,
        filename: upload.filename,
      }).catch((err) => {
        console.error("[upload-intelligence] storeChunks error:", err);
      });

      // Record dedup entry so future identical uploads skip re-extraction.
      if (aiResult.fileHash) {
        void recordDedup(upload.organization_id, aiResult.fileHash, {
          uploadId: upload.id,
          extractedAt: new Date().toISOString(),
          charCount: aiResult.rawText.length,
        }).catch(() => undefined);
      }
    }

    // Calendar already surfaces memory_items.occurred_at directly (passive
    // events like flights and hotel check-ins). On top of that, propose
    // action-shaped reminders for items that need follow-up. invoice due
    // dates, lease/contract renewals, recurring bills. Confidence-gated
    // and date-gated so we don't fill the user's inbox with noise.
    await proposeAutoReminders({
      uploadId: upload.id,
      organizationId: upload.organization_id,
    }).catch(() => undefined);

    void recordSystemEvent({
      kind: "upload.processed",
      severity: "info",
      context: {
        uploadId: upload.id,
        title: newTitle ?? upload.title ?? upload.filename,
        items: aiResult.items.length,
      },
      organizationId: upload.organization_id,
    });

    return;
  }

  // ----- Heuristic fallback (no AI available) -------------------------------
  await supabase.from("extractions").insert(extractionFromHeuristic(upload.id, heuristic));

  const heuristicTitle =
    heuristic.document_type === "resume" && heuristic.detected_people[0]
      ? `${heuristic.detected_people[0]}, resume`
      : null;

  let matchedCustomSectionId: string | null = null;
  if (!heuristic.suggested_section && !upload.section && !upload.custom_section_id) {
    matchedCustomSectionId = await matchCustomSection(upload.filename, upload.organization_id);
  }

  const nextMetadata = skipReason
    ? { ...(upload.metadata ?? {}), extraction_skipped: skipReason }
    : null;

  await supabase
    .from("uploads")
    .update({
      status: "filed",
      document_type: heuristic.document_type,
      ...(heuristic.suggested_section && !upload.section
        ? { section: heuristic.suggested_section }
        : {}),
      ...(matchedCustomSectionId ? { custom_section_id: matchedCustomSectionId } : {}),
      ...(heuristicTitle && (!upload.title || upload.title === upload.filename)
        ? { title: heuristicTitle }
        : {}),
      ...(nextMetadata ? { metadata: nextMetadata } : {}),
    })
    .eq("id", uploadId);

  void recordSystemEvent({
    kind: "upload.processed",
    severity: "info",
    context: {
      uploadId: upload.id,
      title: heuristicTitle ?? upload.title ?? upload.filename,
      heuristic: true,
    },
    organizationId: upload.organization_id,
  });
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
    secondary_languages: Array.from(new Set(ai.items.flatMap((i) => i.secondary_languages))),
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
    confidence: ai.items.reduce((acc, i) => acc + i.confidence, 0) / ai.items.length,
    processor: ai.processor,
  };
}

function extractionFromHeuristic(uploadId: string, heuristic: Classification): ExtractionInsert {
  return {
    upload_id: uploadId,
    document_type: heuristic.document_type,
    language: null,
    secondary_languages: [],
    is_handwritten: null,
    script_hints: [],
    raw_text: null,
    facts: {},
    entities: heuristic.detected_people.length > 0 ? { people: heuristic.detected_people } : {},
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
  // Called from processUpload, which runs in after(). must use the
  // admin client (no cookies post-response).
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("custom_sections")
    .select("id, name, profile")
    .eq("organization_id", organizationId);

  const haystack = filename.toLowerCase();

  type Row = { id: string; name: string; profile: unknown };
  const rows = (data ?? []) as Row[];

  for (const sec of rows) {
    const profile = (
      sec.profile && typeof sec.profile === "object" ? (sec.profile as Record<string, unknown>) : {}
    ) as { kinds?: unknown; related?: unknown };

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
      label: FACT_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
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
