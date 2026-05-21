import "server-only";

/**
 * iPhone photo support.
 *
 * iOS captures images as HEIC/HEIF by default. Anthropic vision doesn't
 * read HEIC, and browsers won't paint it as a thumbnail. Without
 * conversion every iPhone upload lands as `extraction_skipped:
 * unsupported_type`.
 *
 * Strategy: detect at upload time, convert to JPEG before storing, then
 * let every downstream step (storage, signed-URL previews, vision
 * extraction, section routing) treat it as a normal JPEG. The user
 * doesn't see "converting…" — the file just works.
 *
 * Conversion uses heic-convert (pure JS, no native deps, runs on
 * Vercel's Node runtime). Slower than libheif-native but at 5–20
 * beta users a second of CPU per photo is fine.
 */

const HEIC_MIMES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
const HEIC_EXTENSIONS = /\.(heic|heif)$/i;

/**
 * Returns true when the file looks like an iPhone HEIC capture. We
 * check mime *and* extension because iOS sometimes mislabels the
 * upload as `application/octet-stream`, especially when the photo
 * comes through Share → Save to Files first.
 */
export function isHeicLike(file: { name: string; type: string }): boolean {
  if (HEIC_MIMES.has(file.type.toLowerCase())) return true;
  if (HEIC_EXTENSIONS.test(file.name)) return true;
  return false;
}

/**
 * Convert HEIC bytes to JPEG. Throws if the input isn't a valid HEIC
 * container; the caller surfaces a friendly error in that case.
 *
 * Dynamic import keeps the ~3MB heic-convert module out of every
 * cold start that doesn't actually need it.
 */
export async function convertHeicToJpeg(input: Buffer): Promise<Buffer> {
  const convert = (await import("heic-convert")).default;
  // heic-decode internally does `[...buffer]` to read the box header,
  // so it requires an iterable (Uint8Array / Buffer), NOT a raw
  // ArrayBuffer. The @types/heic-convert signature claims ArrayBufferLike,
  // which is wrong at runtime — pass the Buffer through and cast.
  const out = await convert({
    buffer: input as unknown as ArrayBufferLike,
    format: "JPEG",
    quality: 0.9, // matches iOS Camera Roll exports
  });
  return Buffer.from(out);
}

/**
 * Replace .heic/.heif with .jpg so the stored file has a name that
 * matches its actual bytes. We keep the rest of the filename intact
 * so the user still recognises it in the inbox ("IMG_4521.jpg" instead
 * of "IMG_4521.heic").
 */
export function heicNameToJpeg(filename: string): string {
  return filename.replace(HEIC_EXTENSIONS, ".jpg");
}
