import "server-only";

import { getAnthropic, getModel } from "@/lib/ai/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DOC_TYPES,
  SCHEMAS,
  schemaDescription,
  type DocType,
} from "@/lib/ai/extraction-schemas";

const EXTRACTOR_VERSION = "v1";

// ── Text helpers ─────────────────────────────────────────────────────────────

/** Fetch the first N characters of concatenated chunk text for an upload. */
async function getUploadText(
  uploadId: string,
  maxChars = 8000,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("document_chunks")
    .select("content, chunk_index")
    .eq("upload_id", uploadId)
    .order("chunk_index", { ascending: true })
    .limit(40); // ~8000 chars across typical 200-char chunks

  if (!data || data.length === 0) return null;
  const joined = (data as { content: string }[])
    .map((r) => r.content)
    .join("\n\n");
  return joined.slice(0, maxChars);
}

// ── Step 1: classify ─────────────────────────────────────────────────────────

type ClassifyResult = { doc_type: DocType; confidence: number };

export async function classifyDocument(
  text: string,
  filename: string,
): Promise<ClassifyResult> {
  const anthropic = getAnthropic();
  if (!anthropic) return { doc_type: "generic", confidence: 0.5 };

  const preview = text.slice(0, 2000);
  const typeList = DOC_TYPES.join(", ");

  const msg = await anthropic.messages.create({
    model: getModel(),
    max_tokens: 200,
    system: `You classify documents into exactly one of these types: ${typeList}.
Respond with ONLY valid JSON: {"doc_type": "<type>", "confidence": <0-1 float>}.
confidence 1.0 = certain, 0.5 = unsure, 0.3 = guessing.
Use "generic" when the document doesn't clearly fit another category.`,
    messages: [
      {
        role: "user",
        content: `Filename: ${filename}\n\nText preview:\n${preview}`,
      },
    ],
  });

  const raw =
    msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
  try {
    const parsed = JSON.parse(raw) as { doc_type?: string; confidence?: number };
    const docType =
      typeof parsed.doc_type === "string" &&
      (DOC_TYPES as readonly string[]).includes(parsed.doc_type)
        ? (parsed.doc_type as DocType)
        : "generic";
    const confidence =
      typeof parsed.confidence === "number"
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5;
    return { doc_type: docType, confidence };
  } catch {
    return { doc_type: "generic", confidence: 0.3 };
  }
}

// ── Step 2: extract ──────────────────────────────────────────────────────────

type ExtractResult = { fields: Record<string, unknown>; confidence: number };

export async function extractFields(
  text: string,
  docType: DocType,
  accountLanguage?: string | null,
): Promise<ExtractResult> {
  const anthropic = getAnthropic();
  if (!anthropic) return { fields: {}, confidence: 0 };

  const schema = schemaDescription(docType);
  const langNames: Record<string, string> = { en: "English", ar: "Arabic", fr: "French", es: "Spanish" };
  const langHint = accountLanguage && langNames[accountLanguage]
    ? `The user's primary language is ${langNames[accountLanguage]}. Extract text in the original document language. Use English keys for the schema.\n`
    : "";

  const attempt = async (extra = ""): Promise<string> => {
    const msg = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 1000,
      system: `You extract structured fields from a ${docType} document.
${langHint}Respond with ONLY valid JSON matching this schema (omit fields you cannot find):
${schema}
${extra}
Rules:
- All dates: ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)
- All currencies: ISO 4217 three-letter code
- For id_document.number_masked: replace all but last 4 chars with *
- Omit any field you are not confident about`,
      messages: [
        {
          role: "user",
          content: text.slice(0, 8000),
        },
      ],
    });
    return msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
  };

  let raw = await attempt();
  // Strip markdown code fences if present
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Retry once with explicit invalid-JSON framing
    let retry = await attempt(
      "IMPORTANT: Your previous response was not valid JSON. Return ONLY a JSON object, no markdown, no explanation.",
    );
    retry = retry.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try {
      parsed = JSON.parse(retry) as Record<string, unknown>;
    } catch {
      // Fall back to generic after two failures
      return { fields: {}, confidence: 0.2 };
    }
  }

  // Validate against Zod schema, strip unknown keys, coerce optional fields
  const schema_zod = SCHEMAS[docType];
  const result = schema_zod.safeParse(parsed);
  const fields = result.success
    ? (result.data as Record<string, unknown>)
    : (parsed ?? {});

  return { fields, confidence: result.success ? 0.8 : 0.5 };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Full entity extraction pipeline for one upload.
 * Idempotent: skips uploads already extracted with the same extractor version
 * unless user_verified is false (allowing re-extraction after a bug fix).
 */
export async function extractEntity(
  uploadId: string,
  accountLanguage?: string | null,
): Promise<void> {
  const admin = createAdminClient();

  // ── Idempotency check ──────────────────────────────────────────────────
  const { data: existing } = await admin
    .from("extracted_entities")
    .select("id, extractor_version, user_verified")
    .eq("upload_id", uploadId)
    .maybeSingle();

  if (
    existing &&
    existing.extractor_version === EXTRACTOR_VERSION &&
    existing.user_verified === true
  ) {
    // User has verified, never overwrite.
    return;
  }
  if (
    existing &&
    existing.extractor_version === EXTRACTOR_VERSION &&
    existing.user_verified === false
  ) {
    // Already extracted and not yet verified, skip to avoid thrashing.
    return;
  }

  // ── Skip conditions ────────────────────────────────────────────────────
  const { data: upload } = await admin
    .from("uploads")
    .select("id, filename, mime_type, size_bytes, status, organization_id, chunk_count")
    .eq("id", uploadId)
    .maybeSingle();

  if (!upload) return;

  // Skip non-filed uploads, very large files, and image-only files
  if (upload.status !== "filed") return;
  if ((upload.size_bytes ?? 0) > 50 * 1024 * 1024) return; // >50MB
  const mime = upload.mime_type ?? "";
  if (mime.startsWith("image/")) return; // image OCR is Tier 3
  if ((upload.chunk_count ?? 0) === 0) return; // no text extracted

  // ── Fetch text ─────────────────────────────────────────────────────────
  const text = await getUploadText(uploadId);
  if (!text || text.trim().length < 50) return; // too little context

  // ── Classify ───────────────────────────────────────────────────────────
  const { doc_type, confidence: classConf } = await classifyDocument(
    text,
    upload.filename,
  );

  // ── Extract ────────────────────────────────────────────────────────────
  let { fields, confidence: extractConf } = await extractFields(text, doc_type, accountLanguage);

  // If extraction produced nothing useful, fall back to generic
  if (Object.keys(fields).length === 0 && doc_type !== "generic") {
    const fallback = await extractFields(text, "generic", accountLanguage);
    fields = fallback.fields;
    extractConf = fallback.confidence * 0.8; // discount for fallback
  }

  const confidence = (classConf + extractConf) / 2;

  // ── Upsert ─────────────────────────────────────────────────────────────
  await admin.from("extracted_entities").upsert(
    {
      upload_id: uploadId,
      organization_id: upload.organization_id,
      doc_type,
      confidence,
      fields,
      extracted_at: new Date().toISOString(),
      extractor_version: EXTRACTOR_VERSION,
      user_verified: false,
      user_edited_fields: null,
    },
    { onConflict: "upload_id" },
  );
}
