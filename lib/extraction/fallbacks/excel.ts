/**
 * xlsx npm fallback for Excel / CSV files.
 * Used when the Python service is unavailable.
 * Mirrors the existing spreadsheetToText() logic from lib/ai/extract.ts
 * but returns plain text rather than structured JSON.
 */

export async function extractExcelFallback(buffer: Buffer): Promise<string> {
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [];

    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(ws);
      parts.push(`## Sheet: ${name}\n\n${csv}`);
    }

    return parts.join("\n\n");
  } catch (err) {
    console.warn("[fallbacks/excel] xlsx failed:", err);
    return "";
  }
}
