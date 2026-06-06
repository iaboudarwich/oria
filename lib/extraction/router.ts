/**
 * Extraction router. TypeScript side.
 *
 * Routing priority (mirrors Python service):
 *   Excel / CSV    → Python service (pandas)    → xlsx npm fallback
 *   PDF            → Python service (pymupdf4llm → docling) → pdf-parse fallback
 *   DOCX / DOC     → Python service (docling → markitdown) → mammoth fallback
 *   PPTX / PPT     → Python service (docling → markitdown) → "" (no JS fallback)
 *   HTML           → Python service (markitdown → bs4)    → "" (no JS fallback)
 *   Images         → Python service (tesseract)           → "" (handled by Claude)
 *   Plain text     → passthrough (no service call needed)
 *   Unknown        → null (caller falls back to Claude)
 *
 * Returns null when no text was extracted. the caller (extract.ts) then
 * falls back to sending the file as a Claude vision/document block.
 */

import { extractViaService } from "./service";
import { extractPdfFallback } from "./fallbacks/pdf";
import { extractDocxFallback } from "./fallbacks/docx";
import { extractExcelFallback } from "./fallbacks/excel";
import type { ExtractionMethod } from "./types";

export interface RouterResult {
  text: string;
  method: ExtractionMethod;
  fileHash: string;
}

/**
 * Route extraction by MIME type / filename extension.
 *
 * @returns RouterResult when text was obtained, or null when extraction
 *          failed / is not applicable (let the caller use Claude directly).
 */
export async function routeExtraction(
  buffer: Buffer,
  mimeType: string | null,
  filename: string,
): Promise<RouterResult | null> {
  const mime = (mimeType ?? "").toLowerCase().trim();
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  // ── Plain text. passthrough, no service call ────────────────────────────
  if (mime.startsWith("text/plain") || ["txt", "md", "rst", "log"].includes(ext)) {
    try {
      const text = buffer.toString("utf-8");
      return { text, method: "passthrough", fileHash: "" };
    } catch {
      return null;
    }
  }

  // ── Try Python service first for all supported types ─────────────────────
  const serviceResult = await extractViaService(buffer, mime, filename);
  if (serviceResult && serviceResult.text.trim().length >= 50) {
    return {
      text: serviceResult.text,
      method: serviceResult.method as ExtractionMethod,
      fileHash: serviceResult.fileHash,
    };
  }

  // ── npm fallbacks (Python service down or returned sparse text) ───────────

  // PDF fallback
  if (mime === "application/pdf" || ext === "pdf") {
    const text = await extractPdfFallback(buffer);
    if (text.trim().length >= 50) {
      return { text, method: "pdf-parse", fileHash: "" };
    }
    // Still too sparse → let Claude handle it (might be a scanned PDF)
    return null;
  }

  // Excel fallback
  if (
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
      "application/csv",
    ].includes(mime) ||
    ["xlsx", "xls", "csv"].includes(ext)
  ) {
    const text = await extractExcelFallback(buffer);
    if (text.trim().length > 0) {
      return { text, method: "xlsx", fileHash: "" };
    }
    return null;
  }

  // DOCX fallback
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    ["docx", "doc"].includes(ext)
  ) {
    const text = await extractDocxFallback(buffer);
    if (text.trim().length >= 50) {
      return { text, method: "mammoth", fileHash: "" };
    }
    return null;
  }

  // PPTX. no JS fallback; let Claude handle if service failed
  if (
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.ms-powerpoint" ||
    ["pptx", "ppt"].includes(ext)
  ) {
    return null; // Claude fallback in extract.ts
  }

  // Images. no JS OCR fallback; Claude vision handles this
  if (mime.startsWith("image/")) {
    return null;
  }

  return null;
}
