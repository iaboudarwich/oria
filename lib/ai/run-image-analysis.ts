import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeImage } from "@/lib/ai/analyze-image";
import { storeChunks } from "@/lib/embedding/store";

const EXTRACTOR_VERSION = "v1-vision";

/**
 * Full image analysis pipeline for one upload.
 *
 * Steps:
 *   1. Fetch the upload metadata — skip if not an image or already extracted.
 *   2. Download the file bytes from Supabase Storage.
 *   3. Call analyzeImage() — single Haiku vision call returns doc_type,
 *      fields, confidence, raw_text.
 *   4. Store raw_text + description as a document_chunk so semantic search works.
 *   5. Upsert into extracted_entities.
 *
 * This replaces Phase B (entity.extract) for image uploads so the cron
 * doesn't double-process them.
 */
export async function runImageAnalysis(uploadId: string): Promise<void> {
  const admin = createAdminClient();

  // ── Skip conditions ────────────────────────────────────────────────────
  const { data: upload } = await admin
    .from("uploads")
    .select(
      "id, filename, mime_type, size_bytes, status, organization_id, storage_path",
    )
    .eq("id", uploadId)
    .maybeSingle();

  if (!upload) return;
  if (upload.status !== "filed") return;

  const mime = (upload.mime_type as string) ?? "";
  if (!mime.startsWith("image/")) return;

  // Skip if already extracted by vision.
  const { data: existing } = await admin
    .from("extracted_entities")
    .select("id, extractor_version")
    .eq("upload_id", uploadId)
    .maybeSingle();

  if (existing?.extractor_version === EXTRACTOR_VERSION) return;

  // ── Download file ──────────────────────────────────────────────────────
  const { data: blob, error: dlError } = await admin.storage
    .from("uploads")
    .download(upload.storage_path as string);

  if (dlError || !blob) return;
  const imageBytes = Buffer.from(await blob.arrayBuffer());

  // ── Analyse ────────────────────────────────────────────────────────────
  const result = await analyzeImage({
    imageBytes,
    mimeType: mime,
    filename: upload.filename as string,
    organizationId: upload.organization_id as string,
    uploadId,
  });

  if (!result) return; // HEIC, unsupported format, or AI unavailable

  // ── Store text as a document chunk (enables semantic search) ──────────
  const searchText = [result.description, result.raw_text]
    .filter(Boolean)
    .join("\n\n");

  if (searchText.trim().length >= 50) {
    await storeChunks({
      uploadId,
      organizationId: upload.organization_id as string,
      text: searchText,
      filename: upload.filename as string,
    }).catch(() => {});
  }

  // ── Upsert extracted_entities ─────────────────────────────────────────
  await admin.from("extracted_entities").upsert(
    {
      upload_id: uploadId,
      organization_id: upload.organization_id,
      doc_type: result.doc_type,
      confidence: result.confidence,
      fields: result.fields,
      extracted_at: new Date().toISOString(),
      extractor_version: EXTRACTOR_VERSION,
      user_verified: false,
      user_edited_fields: null,
    },
    { onConflict: "upload_id" },
  );
}
