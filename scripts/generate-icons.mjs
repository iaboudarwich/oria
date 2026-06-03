#!/usr/bin/env node
/**
 * PWA icon generator (Round 15).
 *
 * Source: public/logo.svg — the full Oria lockup (disc emblem + "Oria"
 * wordmark on a beige field). For app icons we want ONLY the circular disc
 * emblem, dropping the wordmark text, centered on the --canvas field and
 * filling the frame.
 *
 * Geometry (derived from public/logo.svg, do not guess): the emblem group is
 *   <g transform="translate(152 50) scale(7.2)"> ... </g>
 * and its boundary ring is <circle cx=50 cy=50 r=38 stroke-width=2.4>. In the
 * 1024x1024 canvas that puts the disc center at (512, 410) with an outer radius
 * (including stroke) of 38*7.2 + 1.2*7.2 = 282.24.
 *
 * Outputs (public/icons/ + favicon):
 *   icon-192.png            192, emblem fills frame
 *   icon-512.png            512, emblem fills frame
 *   icon-maskable-512.png   512, emblem at ~80% with a 10% safe zone
 *   apple-touch-icon.png    180, emblem fills frame (opaque, no transparency)
 *   ../favicon.ico          16/32/48 multi-size, from the same emblem
 *
 * Re-run with: node scripts/generate-icons.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANVAS = "#f7f5f0"; // --canvas (light), per app/globals.css

// Disc geometry in the 1024 canvas.
const CX = 512;
const CY = 410;
const OUTER_R = 282.24; // ring outer edge incl. stroke

// "Fills the frame": tight square around the disc with ~1% breathing room so
// the stroke is never clipped at the edge.
const TIGHT_HALF = Math.round(OUTER_R) + 3; // 285, ~1% past the disc edge
const TIGHT = {
  minX: CX - TIGHT_HALF,
  minY: CY - TIGHT_HALF,
  size: TIGHT_HALF * 2,
};

// Maskable: emblem occupies the inner 80% (10% safe zone each side).
const MASK_TOTAL = TIGHT.size / 0.8;
const MASK_PAD = (MASK_TOTAL - TIGHT.size) / 2;
const MASK = {
  minX: TIGHT.minX - MASK_PAD,
  minY: TIGHT.minY - MASK_PAD,
  size: MASK_TOTAL,
};

function extractEmblemGroup(svg) {
  const gStart = svg.indexOf('<g transform="translate(152 50) scale(7.2)">');
  if (gStart === -1) throw new Error("emblem group not found in logo.svg");
  // The wordmark <text> follows the emblem group; everything before it (after
  // gStart) is the emblem, terminated by its own </g>.
  const wordmark = svg.indexOf("<!-- WORDMARK", gStart);
  if (wordmark === -1) throw new Error("wordmark marker not found in logo.svg");
  const group = svg.slice(gStart, wordmark).trim();
  if (!group.endsWith("</g>")) throw new Error("emblem group did not close cleanly");
  return group;
}

// Build a standalone SVG cropped to `box`, emblem on the --canvas field.
function emblemSvg(emblemGroup, box) {
  const { minX, minY, size } = box;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${minX} ${minY} ${size} ${size}">
  <rect x="${minX}" y="${minY}" width="${size}" height="${size}" fill="${CANVAS}"/>
  ${emblemGroup}
</svg>`;
}

// Rasterize an SVG to a crisp master PNG buffer (supersample then downscale).
async function rasterize(svgString, outSize) {
  const SUPER = 3;
  return sharp(Buffer.from(svgString), { density: 96 * SUPER })
    .resize(outSize * SUPER, outSize * SUPER)
    .resize(outSize, outSize)
    .flatten({ background: CANVAS }) // composite onto the canvas field (opaque)
    .ensureAlpha() // keep a 4-channel RGBA payload (the .ico decoder requires it)
    .png()
    .toBuffer();
}

// Minimal ICO writer: wraps PNG payloads (one per size) into a multi-size .ico.
function pngsToIco(items) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(items.length, 4);

  const entries = [];
  const datas = [];
  let offset = 6 + items.length * 16;
  for (const { size, buffer } of items) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // color count
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buffer.length, 8); // image data size
    e.writeUInt32LE(offset, 12); // offset
    entries.push(e);
    datas.push(buffer);
    offset += buffer.length;
  }
  return Buffer.concat([header, ...entries, ...datas]);
}

async function main() {
  const svg = readFileSync(join(ROOT, "public", "logo.svg"), "utf8");
  const emblem = extractEmblemGroup(svg);

  const tightSvg = emblemSvg(emblem, TIGHT);
  const maskSvg = emblemSvg(emblem, MASK);

  const iconsDir = join(ROOT, "public", "icons");
  mkdirSync(iconsDir, { recursive: true });

  // Frame-filling icons.
  for (const size of [192, 512]) {
    const buf = await rasterize(tightSvg, size);
    writeFileSync(join(iconsDir, `icon-${size}.png`), buf);
    console.log(`wrote icons/icon-${size}.png`);
  }

  // Apple touch icon (opaque, 180).
  writeFileSync(join(iconsDir, "apple-touch-icon.png"), await rasterize(tightSvg, 180));
  console.log("wrote icons/apple-touch-icon.png");

  // Maskable (80% emblem + 10% safe zone).
  writeFileSync(join(iconsDir, "icon-maskable-512.png"), await rasterize(maskSvg, 512));
  console.log("wrote icons/icon-maskable-512.png");

  // favicon.ico (multi-size, from the emblem) — Next serves app/favicon.ico at /favicon.ico.
  const icoItems = [];
  for (const size of [16, 32, 48]) {
    icoItems.push({ size, buffer: await rasterize(tightSvg, size) });
  }
  writeFileSync(join(ROOT, "app", "favicon.ico"), pngsToIco(icoItems));
  console.log("wrote app/favicon.ico");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
