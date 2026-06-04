#!/usr/bin/env node
/**
 * PWA / favicon icon generator.
 *
 * Source of truth: public/logo.svg (the new "Oria" wordmark master) with the
 * pixel-accurate render committed as public/brand/oria-1024.png. The wordmark
 * was rendered with its intended font (Newsreader), so we resize from that PNG
 * rather than re-rasterizing the SVG (whose font would fall back on a machine
 * without Newsreader installed).
 *
 * Outputs (public/icons/ + app/favicon.ico), filenames unchanged so the
 * manifest / metadata references keep resolving:
 *   icon-192.png            192, wordmark fills the frame on the canvas field
 *   icon-512.png            512
 *   icon-maskable-512.png   512, wordmark scaled into the inner safe zone
 *   apple-touch-icon.png    180, opaque
 *   ../app/favicon.ico      16/32/48 multi-size
 *
 * NOTE (flagged in the round report): the brand is now a horizontal wordmark
 * with no emblem. It is legible at 192px+ but illegible at favicon (16px) and
 * cramped under a circular/maskable mask. A monogram for the small-icon
 * contexts is a brand decision left to the owner; this script does not invent
 * one.
 *
 * Re-run with: node scripts/generate-icons.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANVAS = "#f5f1ea"; // the wordmark master's background field
const MASTER = join(ROOT, "public", "brand", "oria-1024.png");

/** Resize the master to a square, opaque on the canvas field. */
async function frame(size) {
  return sharp(MASTER)
    .resize(size, size, { fit: "contain", background: CANVAS })
    .flatten({ background: CANVAS })
    .ensureAlpha()
    .png()
    .toBuffer();
}

/**
 * Maskable: the safe zone for a maskable icon is the inner 80%, and Android may
 * apply a circular mask, so a horizontal wordmark is scaled further (to ~64% of
 * the frame) and centered on the canvas field to survive the crop.
 */
async function maskable(size) {
  const inner = Math.round(size * 0.64);
  const wm = await sharp(MASTER)
    .resize(inner, inner, { fit: "contain", background: CANVAS })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: CANVAS },
  })
    .composite([{ input: wm, gravity: "center" }])
    .flatten({ background: CANVAS })
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
  // Touch the source SVG so a missing master fails loudly rather than silently.
  readFileSync(join(ROOT, "public", "logo.svg"), "utf8");

  const iconsDir = join(ROOT, "public", "icons");
  mkdirSync(iconsDir, { recursive: true });

  for (const size of [192, 512]) {
    writeFileSync(join(iconsDir, `icon-${size}.png`), await frame(size));
    console.log(`wrote icons/icon-${size}.png`);
  }
  writeFileSync(join(iconsDir, "apple-touch-icon.png"), await frame(180));
  console.log("wrote icons/apple-touch-icon.png");
  writeFileSync(join(iconsDir, "icon-maskable-512.png"), await maskable(512));
  console.log("wrote icons/icon-maskable-512.png");

  const icoItems = [];
  for (const size of [16, 32, 48]) icoItems.push({ size, buffer: await frame(size) });
  writeFileSync(join(ROOT, "app", "favicon.ico"), pngsToIco(icoItems));
  console.log("wrote app/favicon.ico");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
