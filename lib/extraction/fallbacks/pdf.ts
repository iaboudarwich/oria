/**
 * pdf-parse npm fallback for native PDFs.
 * Used when the Python service is unavailable.
 */

export async function extractPdfFallback(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse doesn't ship TS types natively; import via require path
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    return result.text ?? "";
  } catch (err) {
    console.warn("[fallbacks/pdf] pdf-parse failed:", err);
    return "";
  }
}
