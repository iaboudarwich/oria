/**
 * Store document chunks + embeddings in pgvector (document_chunks table).
 *
 * Called after extraction completes for an upload.
 * Skips embeddings when the Python service is unavailable — chunks are
 * stored as text-only and can be re-embedded later.
 */

import * as Sentry from "@sentry/nextjs";
// Use the service-role admin client — document_chunks has no INSERT policy
// for the anon/authenticated roles (writes are service-role only per migration
// 0024). Using createClient() (anon key) here would silently fail in cron
// and background contexts where no user session cookie is present.
import { createAdminClient } from "@/lib/supabase/admin";
import { embedViaService } from "@/lib/extraction/service";
import { splitIntoChunks, estimateTokens } from "@/lib/extraction/chunk";

export interface StoreChunksInput {
  uploadId: string;
  organizationId: string;
  text: string;
  section?: string;
  filename?: string;
}

export interface StoreChunksResult {
  chunkCount: number;
  withEmbeddings: boolean;
}

/**
 * Split text into chunks, embed them, and upsert into document_chunks.
 * Also updates uploads.chunk_count and uploads.is_chunked.
 */
export async function storeChunks(
  input: StoreChunksInput
): Promise<StoreChunksResult> {
  const { uploadId, organizationId, text, section, filename } = input;
  const supabase = createAdminClient();

  const chunks = splitIntoChunks(text);
  if (chunks.length === 0) {
    return { chunkCount: 0, withEmbeddings: false };
  }

  // Embed all chunks (batch)
  const embeddings = await embedViaService(chunks);
  const hasEmbeddings = embeddings !== null && embeddings.length === chunks.length;

  // Build rows for upsert
  const rows = chunks.map((content, i) => ({
    upload_id: uploadId,
    organization_id: organizationId,
    chunk_index: i,
    content,
    embedding: hasEmbeddings ? JSON.stringify(embeddings[i]) : null,
    token_count: estimateTokens(content),
    metadata: {
      ...(section ? { section } : {}),
      ...(filename ? { filename } : {}),
    },
  }));

  // Upsert in batches of 100 to stay within Supabase request limits
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("document_chunks")
      .upsert(batch, { onConflict: "upload_id,chunk_index" });

    if (error) {
      console.error("[embedding/store] upsert error:", error);
      Sentry.captureException(new Error(`Failed to store chunks: ${error.message}`), {
        tags: { surface: "embeddings" },
        extra: { uploadId, organizationId },
      });
      throw new Error(`Failed to store chunks: ${error.message}`);
    }
  }

  // Update uploads row
  await supabase
    .from("uploads")
    .update({ chunk_count: chunks.length, is_chunked: true })
    .eq("id", uploadId);

  return { chunkCount: chunks.length, withEmbeddings: hasEmbeddings };
}

/** Delete all chunks for an upload (called when upload is deleted). */
export async function deleteChunks(uploadId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("document_chunks").delete().eq("upload_id", uploadId);
  await supabase
    .from("uploads")
    .update({ chunk_count: 0, is_chunked: false })
    .eq("id", uploadId);
}
