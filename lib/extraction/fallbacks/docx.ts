/**
 * mammoth npm fallback for DOCX files.
 * Used when the Python service is unavailable.
 */

export async function extractDocxFallback(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  } catch (err) {
    console.warn("[fallbacks/docx] mammoth failed:", err);
    return "";
  }
}
