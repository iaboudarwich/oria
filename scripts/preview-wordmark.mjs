// Dev-only: rasterize the Oria wordmark path at sidebar size with a few stroke
// weights, ink-on-cream and ivory-on-dark, to eyeball the "heavier" tuning.
// Not committed / not imported by the build. Run: node scripts/preview-wordmark.mjs
import { readFileSync } from "node:fs";
import sharp from "sharp";

const src = readFileSync(new URL("../lib/brand/wordmark-path.ts", import.meta.url), "utf8");
const vb = src.match(/ORIA_VIEWBOX = "([^"]+)"/)[1];
const d = src.match(/ORIA_PATH =\s*\n\s*"([^"]+)"/)[1];
const [, , w, h] = vb.split(" ").map(Number);

const H = 44; // ~2x sidebar height for clarity
const W = Math.round((H * w) / h);
const weights = [0, 8, 11, 14];

function glyph(stroke, color) {
  const s =
    stroke > 0
      ? `stroke="${color}" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round"`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${W}" height="${H}"><path d="${d}" fill="${color}" ${s}/></svg>`;
}

async function strip(bg, color, label) {
  const pad = 16;
  const rowH = H + pad;
  const tiles = await Promise.all(
    weights.map((wt) => sharp(Buffer.from(glyph(wt, color))).png().toBuffer()),
  );
  const stripW = (W + 40) * weights.length + pad;
  const base = sharp({
    create: { width: stripW, height: rowH, channels: 3, background: bg },
  });
  const composites = tiles.map((buf, i) => ({
    input: buf,
    left: pad + i * (W + 40),
    top: Math.round(pad / 2),
  }));
  await base.composite(composites).png().toFile(`/tmp/wordmark_${label}.png`);
  console.log(`wrote /tmp/wordmark_${label}.png  (weights ${weights.join(", ")})`);
}

await strip("#f5f1ea", "#0f0f0f", "light");
await strip("#1c1a17", "#f5f1ea", "dark");
