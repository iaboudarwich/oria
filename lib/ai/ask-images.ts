import "server-only";

import { convertHeicToJpeg } from "@/lib/upload/heic";

/** An inline image ready for a multimodal model call. */
export type InlineImage = { mimeType: string; dataBase64: string };

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const HEIC = new Set(["image/heic", "image/heif"]);
const MAX_IMAGES = 5;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB decoded, per image

/**
 * Validate and normalise the images a client attached to an Ask Oria question.
 * The client already caps count/size, but this is the security gate: it re-checks
 * the limits server-side, drops anything outside the allowlist, and converts HEIC
 * (iPhone captures) to JPEG so the vision model can read it. Never throws. an
 * unreadable image is simply skipped, so the question still gets answered.
 */
export async function prepareAskImages(raw: unknown): Promise<InlineImage[]> {
  if (!Array.isArray(raw)) return [];
  const out: InlineImage[] = [];
  for (const item of raw.slice(0, MAX_IMAGES)) {
    if (!item || typeof item !== "object") continue;
    const mimeType = String((item as { mimeType?: unknown }).mimeType ?? "").toLowerCase();
    const dataBase64 = String((item as { dataBase64?: unknown }).dataBase64 ?? "");
    if (!dataBase64) continue;
    const bytes = Buffer.from(dataBase64, "base64");
    if (bytes.length === 0 || bytes.length > MAX_BYTES) continue;
    if (HEIC.has(mimeType)) {
      try {
        const jpeg = await convertHeicToJpeg(bytes);
        out.push({ mimeType: "image/jpeg", dataBase64: jpeg.toString("base64") });
      } catch {
        // Unreadable HEIC container. skip it rather than fail the whole query.
      }
    } else if (ALLOWED.has(mimeType)) {
      out.push({ mimeType, dataBase64 });
    }
  }
  return out;
}
