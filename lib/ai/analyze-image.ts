import "server-only";

import sharp from "sharp";
import { getAnthropic, getModel } from "@/lib/ai/anthropic";
import { SCHEMAS, type DocType } from "@/lib/ai/extraction-schemas";
import { recordSystemEvent } from "@/lib/data/system-events";

/** Claude vision supports these MIME types natively. */
const SUPPORTED_VISION_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/**
 * Max long-edge in pixels before downscaling with sharp.
 * Claude vision handles up to 8192px, but we keep costs low.
 */
const MAX_EDGE_PX = 2048;

/** Doc types the vision model can return beyond the text doc types. */
const IMAGE_DOC_TYPES: DocType[] = [
  "product",
  "scene",
  "receipt",
  "id_document",
  "generic",
];

export type ImageAnalysisResult = {
  description: string;
  doc_type: DocType;
  fields: Record<string, unknown>;
  confidence: number;
  raw_text: string | null;
};

/**
 * Downscale an image buffer so the long edge is ≤ MAX_EDGE_PX.
 * Returns the original buffer unchanged when already within bounds.
 */
async function maybeDownscale(
  buffer: Buffer,
  mimeType: string,
): Promise<Buffer> {
  try {
    const meta = await sharp(buffer).metadata();
    const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (longEdge <= MAX_EDGE_PX) return buffer;
    return await sharp(buffer)
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: "inside" })
      .toFormat(mimeType === "image/png" ? "png" : "jpeg")
      .toBuffer();
  } catch {
    // If sharp fails, pass through the original buffer.
    return buffer;
  }
}

/**
 * Analyse an image with Claude Haiku 4.5 vision.
 * Single call returns classification, structured field extraction, and OCR.
 *
 * Skips HEIC format (returns null + logs system_event).
 * Downscales images > 5 MB using sharp before sending.
 */
export async function analyzeImage(params: {
  imageBytes: Buffer;
  mimeType: string;
  filename: string;
  organizationId?: string | null;
  uploadId?: string | null;
  /** User's preferred_language — used as extraction hint */
  accountLanguage?: string | null;
}): Promise<ImageAnalysisResult | null> {
  const { mimeType, filename } = params;
  let { imageBytes } = params;

  // HEIC: skip and log.
  if (
    mimeType === "image/heic" ||
    mimeType === "image/heif" ||
    filename.toLowerCase().endsWith(".heic") ||
    filename.toLowerCase().endsWith(".heif")
  ) {
    void recordSystemEvent({
      kind: "image.heic_skipped",
      severity: "info",
      message: "HEIC image skipped — vision analysis not supported for HEIC",
      context: { filename, uploadId: params.uploadId ?? null },
      organizationId: params.organizationId ?? null,
    });
    return null;
  }

  // Only send supported MIME types to Claude vision.
  if (!SUPPORTED_VISION_MIME.has(mimeType)) {
    return null;
  }

  // Downscale large images (> 5 MB or long edge > MAX_EDGE_PX).
  if (imageBytes.byteLength > 5 * 1024 * 1024) {
    imageBytes = await maybeDownscale(imageBytes, mimeType);
  }

  const anthropic = getAnthropic();
  if (!anthropic) return null;

  const typeList = IMAGE_DOC_TYPES.join(", ");
  const productDesc = `product (a packaged consumer item — food, beverage, supplement, cosmetics, electronics, household goods)`;
  const sceneDesc = `scene (a photo of a place, meal, event, person, or object)`;

  const langNames: Record<string, string> = { en: "English", ar: "Arabic", fr: "French", es: "Spanish" };
  const accountLang = params.accountLanguage;
  const langHint = accountLang && langNames[accountLang]
    ? `The user's primary language is ${langNames[accountLang]}. Transcribe text in its original language. If the document is in a non-Latin script, include both the original transcription AND a romanized version where applicable. Provide structured field values in the original language.`
    : "";

  const systemPrompt = `You analyze images and return structured JSON.
${langHint ? `\n${langHint}\n` : ""}
For the image provided:
1. Describe what you see in 1-3 sentences.
2. Classify it as one of: ${typeList}. Use ${productDesc}. Use ${sceneDesc}.
3. Extract structured fields for that type.
4. Transcribe any visible text (receipt totals, labels, IDs, etc.).

Return ONLY valid JSON with this shape:
{
  "description": "...",
  "doc_type": "<one of: ${typeList}>",
  "fields": { ...type-specific fields... },
  "confidence": <0.0-1.0>,
  "raw_text": "...all visible text, or null if none..."
}

Field shapes by doc_type:
- receipt: {merchant, total (number), currency (ISO 4217), date (YYYY-MM-DD), line_items (optional)}
- id_document: {document_type, number_masked (all but last 4 replaced with *), expiration_date, name_on_document}
- product: {product_name, brand (optional), category (food|beverage|supplement|cosmetic|household|electronics|clothing|other), key_attributes (array, optional), inferred_purpose (optional)}
- scene: {scene_type (e.g. meal, landscape, event, object), primary_subject, location_hints (optional), context}
- generic: {title (under 80 chars), summary (1-3 sentences), key_dates (optional), key_amounts (optional)}

Rules:
- For number_masked: replace all characters except the last 4 with *.
- Omit fields you cannot confidently extract.
- confidence: 0.9 = very clear image with all fields readable; 0.5 = partial; 0.3 = unclear.`;

  try {
    const msg = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: imageBytes.toString("base64"),
              },
            },
            {
              type: "text",
              text: `Filename: ${filename}`,
            },
          ],
        },
      ],
    });

    const raw =
      msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as {
      description?: string;
      doc_type?: string;
      fields?: Record<string, unknown>;
      confidence?: number;
      raw_text?: string | null;
    };

    const docType: DocType =
      typeof parsed.doc_type === "string" &&
      IMAGE_DOC_TYPES.includes(parsed.doc_type as DocType)
        ? (parsed.doc_type as DocType)
        : "generic";

    // Validate fields against the Zod schema for the doc type.
    const schema = SCHEMAS[docType];
    const rawFields = parsed.fields ?? {};
    const validation = schema?.safeParse(rawFields);
    const fields =
      validation?.success ? (validation.data as Record<string, unknown>) : rawFields;

    return {
      description: typeof parsed.description === "string" ? parsed.description : "",
      doc_type: docType,
      fields,
      confidence: typeof parsed.confidence === "number"
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5,
      raw_text:
        typeof parsed.raw_text === "string" && parsed.raw_text.trim()
          ? parsed.raw_text
          : null,
    };
  } catch (err) {
    void recordSystemEvent({
      kind: "ai.error",
      severity: "error",
      message: err instanceof Error ? err.message : "analyzeImage failed",
      context: { filename, uploadId: params.uploadId ?? null },
      organizationId: params.organizationId ?? null,
    });
    return null;
  }
}
