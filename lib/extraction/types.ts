/**
 * Shared types for the multi-stage extraction pipeline.
 */

export type ExtractionMethod =
  | "pymupdf4llm"
  | "docling"
  | "pandas"
  | "markitdown"
  | "tesseract"
  | "passthrough"
  | "pdf-parse" // npm pdf-parse fallback
  | "mammoth" // npm mammoth fallback (DOCX)
  | "xlsx" // npm xlsx fallback (sheets)
  | "claude" // Claude vision/document block (existing path)
  | "failed";

export interface ExtractionServiceResult {
  text: string;
  method: ExtractionMethod;
  fileHash: string;
  charCount: number;
}

/** A single text chunk stored in document_chunks. */
export interface DocumentChunk {
  uploadId: string;
  organizationId: string;
  chunkIndex: number;
  content: string;
  embedding?: number[];
  tokenCount?: number;
  metadata: {
    section?: string;
    filename?: string;
    page?: number;
    [key: string]: unknown;
  };
}

/** Result of the chunking step. */
export interface ChunkResult {
  chunks: DocumentChunk[];
  totalChars: number;
}
