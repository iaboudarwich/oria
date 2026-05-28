/**
 * xlsx npm fallback REMOVED.
 *
 * The xlsx package had two unpatched high-severity CVEs (CVE-2023-30533,
 * CVE-2024-22363). Excel / CSV extraction is now handled exclusively by the
 * Python sidecar (pandas / openpyxl). This stub exists so that import paths
 * in router.ts are unchanged; it always returns an empty string so the router
 * falls through to null and the upload is skipped until the sidecar is back.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function extractExcelFallback(_buffer: Buffer): Promise<string> {
  return "";
}
