#!/usr/bin/env node
/**
 * Visual-regression check (Round: design infra, Part 5). Drives a real Chromium
 * (the installed `playwright`, same convention as verify-a11y / verify-pwa)
 * against the DETERMINISTIC design-system gallery (/dev/visual) and the core
 * surfaces, screenshots them, and pixel-diffs against committed baselines so the
 * LOOK cannot silently drift. The gallery has no user data, so its baseline is
 * stable; the authed surfaces (Home / Health / Finance) screenshot when a dev
 * session can be minted (Supabase keys present) and tolerate small data churn
 * via the diff threshold.
 *
 * The gallery route is dev-gated (404s under `next start`), so run this against
 * a `next dev` server:
 *
 *   npm run dev &                 # http://localhost:3000
 *   BASE=http://localhost:3000 npm run verify:visual            # check
 *   BASE=http://localhost:3000 npm run verify:visual -- --update # (re)capture baselines
 *
 * Baselines live in tests/visual/ and are committed. Cross-OS font rendering
 * differs, so regenerate baselines in the same (pinned CI container) environment
 * the check runs in; the threshold absorbs sub-pixel antialiasing noise.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BASELINE_DIR = join(ROOT, "tests", "visual");

const BASE = process.env.BASE || "http://localhost:3000";
const UPDATE = process.argv.includes("--update");
// Allow up to 0.2% of pixels to differ (sub-pixel AA), per shot.
const THRESHOLD = Number(process.env.VISUAL_THRESHOLD || "0.002");

// Deterministic, no-auth gallery is the primary baseline; the surfaces are
// best-effort (only when a session is available).
const SHOTS = [{ name: "gallery", path: "/dev/visual", auth: false, width: 1440, height: 2200 }];

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
  ok ? pass++ : fail++;
}

function compare(name, actualBuf) {
  const baselinePath = join(BASELINE_DIR, `${name}.png`);
  if (UPDATE || !existsSync(baselinePath)) {
    if (!existsSync(BASELINE_DIR)) mkdirSync(BASELINE_DIR, { recursive: true });
    writeFileSync(baselinePath, actualBuf);
    check(`${name} baseline written`, true, baselinePath.replace(ROOT + "/", ""));
    return;
  }
  const baseline = PNG.sync.read(readFileSync(baselinePath));
  const actual = PNG.sync.read(actualBuf);
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    check(
      `${name} matches baseline`,
      false,
      `size ${actual.width}x${actual.height} vs ${baseline.width}x${baseline.height}`,
    );
    return;
  }
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const changed = pixelmatch(
    baseline.data,
    actual.data,
    diff.data,
    baseline.width,
    baseline.height,
    {
      threshold: 0.1,
    },
  );
  const ratio = changed / (baseline.width * baseline.height);
  const ok = ratio <= THRESHOLD;
  if (!ok) {
    const outPath = join(BASELINE_DIR, `${name}.actual.png`);
    writeFileSync(outPath, PNG.sync.write(actual));
    writeFileSync(join(BASELINE_DIR, `${name}.diff.png`), PNG.sync.write(diff));
  }
  check(
    `${name} matches baseline`,
    ok,
    `${(ratio * 100).toFixed(3)}% changed (max ${(THRESHOLD * 100).toFixed(2)}%)`,
  );
}

async function run() {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ deviceScaleFactor: 1, colorScheme: "dark" });
    const page = await ctx.newPage();
    for (const shot of SHOTS) {
      await page.setViewportSize({ width: shot.width, height: shot.height });
      const res = await page.goto(`${BASE}${shot.path}`, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      if (!res || res.status() >= 400) {
        check(
          `${shot.name} reachable`,
          false,
          `status ${res ? res.status() : "no response"} (is \`next dev\` running at ${BASE}?)`,
        );
        continue;
      }
      // Freeze the living-bg drift + any motion before the shot.
      await page.addStyleTag({
        content: "*{animation:none !important;transition:none !important}",
      });
      await page.waitForTimeout(200);
      const buf = await page.screenshot({ fullPage: true });
      compare(shot.name, buf);
    }
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
