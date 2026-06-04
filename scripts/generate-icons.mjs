#!/usr/bin/env node
/**
 * PWA / favicon icon generator.
 *
 * Source of truth: public/brand/monogram.svg, the Newsreader capital "O" as a
 * font-independent vector path (produced by scripts/build-brand-assets.mjs).
 * Because it is a path, sharp rasterizes it identically on any machine with no
 * font installed and no network: this script needs only sharp.
 *
 * The square brand mark is the monogram, not the horizontal wordmark: a single
 * "O" stays legible at 16px and survives a circular maskable crop, where the
 * full "Oria" lockup could not. Ink #0f0f0f on cream #f5f1ea.
 *
 * Outputs (public/icons/ + app/favicon.ico), filenames unchanged so the
 * manifest / metadata references keep resolving:
 *   icon-192.png            192, monogram with comfortable padding
 *   icon-512.png            512
 *   icon-maskable-512.png   512, monogram scaled into the inner safe zone
 *   apple-touch-icon.png    180, opaque
 *   ../app/favicon.ico      16/32/48 multi-size
 *
 * Re-run with: node scripts/generate-icons.mjs
 * (Re-extract the monogram itself with scripts/build-brand-assets.mjs.)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CREAM = "#f5f1ea"; // the brand's cream field
const MONOGRAM = join(ROOT, "public", "brand", "monogram.svg");
const monogramSvg = readFileSync(MONOGRAM);

// Fraction of the frame the "O" occupies. Regular icons get comfortable
// padding; the maskable variant sits inside the inner 80% safe circle with
// margin so a circular OS mask never clips the glyph.
const REGULAR_FRAC = 0.66;
const MASKABLE_FRAC = 0.56;

/**
 * Place the monogram, scaled to `frac` of the frame, centered and opaque on the
 * cream field. The SVG is rasterized at high density so even the largest icon
 * is crisp; smaller sizes downscale from there.
 */
async function place(size, frac) {
  const glyphHeight = Math.round(frac * size);
  const glyph = await sharp(monogramSvg, { density: 360 })
    .resize({ height: glyphHeight })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: CREAM },
  })
    .composite([{ input: glyph, gravity: "center" }])
    .flatten({ background: CREAM })
    .ensureAlpha()
    .png()
    .toBuffer();
}

/** Minimal ICO writer: wraps PNG payloads (one per size) into a multi-size .ico. */
function pngsToIco(items) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(items.length, 4);
  const entries = [];
  const datas = [];
  let offset = 6 + items.length * 16;
  for (const { size, buffer } of items) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buffer.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    datas.push(buffer);
    offset += buffer.length;
  }
  return Buffer.concat([header, ...entries, ...datas]);
}

async function main() {
  const iconsDir = join(ROOT, "public", "icons");
  mkdirSync(iconsDir, { recursive: true });

  for (const size of [192, 512]) {
    writeFileSync(join(iconsDir, `icon-${size}.png`), await place(size, REGULAR_FRAC));
    console.log(`wrote icons/icon-${size}.png`);
  }
  writeFileSync(join(iconsDir, "apple-touch-icon.png"), await place(180, REGULAR_FRAC));
  console.log("wrote icons/apple-touch-icon.png");
  writeFileSync(join(iconsDir, "icon-maskable-512.png"), await place(512, MASKABLE_FRAC));
  console.log("wrote icons/icon-maskable-512.png");

  const icoItems = [];
  for (const size of [16, 32, 48]) icoItems.push({ size, buffer: await place(size, REGULAR_FRAC) });
  writeFileSync(join(ROOT, "app", "favicon.ico"), pngsToIco(icoItems));
  console.log("wrote app/favicon.ico");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
