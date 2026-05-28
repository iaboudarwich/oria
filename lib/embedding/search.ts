/**
 * Semantic search via pgvector + hybrid keyword ranking.
 *
 * Hybrid strategy:
 *   1. Embed the query via the Python service.
 *   2. Call match_document_chunks() RPC (cosine similarity, HNSW index).
 *   3. If embeddings unavailable, fall back to Supabase full-text search
 *      on the content column.
 *   4. Deduplicate and return top-N chunks with their source upload metadata.
 */

import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { embedQueryViaService } from "@/lib/extraction/service";

export interface SemanticSearchOptions {
  organizationId: string;
  query: string;
  topK?: number;
  similarityThreshold?: number;
  section?: string;
}

export interface SearchChunk {
  id: string;
  uploadId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface SemanticSearchResult {
  chunks: SearchChunk[];
  method: "vector" | "fulltext" | "none";
}

/**
 * Search document chunks for the given query within an organisation.
 */
export async function searchChunks(
  opts: SemanticSearchOptions
): Promise<SemanticSearchResult> {
  const {
    organizationId,
    query,
    topK = 10,
    similarityThreshold = 0.3,
    section,
  } = opts;

  const supabase = await createClient();

  // ── Vector search ─────────────────────────────────────────────────────────
  const queryEmbedding = await embedQueryViaService(query);

  if (queryEmbedding && queryEmbedding.length === 384) {
    const { data, error } = await supabase.rpc("match_document_chunks", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_org_id: organizationId,
      match_count: topK,
      similarity_threshold: similarityThreshold,
      filter_section: section ?? null,
    });

    if (!error && data && data.length > 0) {
      return {
        chunks: (data as Array<{
          id: string;
          upload_id: string;
          chunk_index: number;
          content: string;
          similarity: number;
          metadata: Record<string, unknown>;
        }>).map((row) => ({
          id: row.id,
          uploadId: row.upload_id,
          chunkIndex: row.chunk_index,
          content: row.content,
          similarity: row.similarity,
          metadata: row.metadata ?? {},
        })),
        method: "vector",
      };
    }

    if (error) {
      Sentry.captureException(new Error(error.message ?? "match_document_chunks RPC error"), {
        tags: { surface: "embeddings" },
        extra: { organizationId },
      });
      console.warn("[embedding/search] match_document_chunks RPC error:", error);
    }
  }

  // ── Full-text fallback ────────────────────────────────────────────────────
  let ftQuery = supabase
    .from("document_chunks")
    .select("id, upload_id, chunk_index, content, metadata")
    .eq("organization_id", organizationId)
    .textSearch("content", query, { type: "websearch", config: "english" })
    .limit(topK);

  if (section) {
    ftQuery = ftQuery.contains("metadata", { section });
  }

  const { data: ftData, error: ftError } = await ftQuery;

  if (!ftError && ftData && ftData.length > 0) {
    return {
      chunks: (ftData as Array<{
        id: string;
        upload_id: string;
        chunk_index: number;
        content: string;
        metadata: Record<string, unknown>;
      }>).map((row, i) => ({
        id: row.id,
        uploadId: row.upload_id,
        chunkIndex: row.chunk_index,
        content: row.content,
        similarity: 1 - i * 0.05, // synthetic score for ranking
        metadata: row.metadata ?? {},
      })),
      method: "fulltext",
    };
  }

  return { chunks: [], method: "none" };
}
