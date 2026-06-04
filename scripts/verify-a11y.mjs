#!/usr/bin/env node
/**
 * Accessibility verification (Round 14.8 F1). Drives a real Chromium against a
 * running server (`next start`) and runs axe-core (WCAG 2.0/2.1 A + AA) on a set
 * of routes, asserting ZERO critical or serious violations (heuristics §5).
 *
 * axe-core is injected from node_modules (no @axe-core/playwright dependency
 * needed), matching the repo convention of self-contained verification scripts
 * (see scripts/verify-pwa.mjs).
 *
 * Public routes are scanned unauthenticated. To include authenticated dashboard
 * routes, pass a session cookie via the ORIA_SESSION_COOKIE env (name=value),
 * captured from a logged-in browser; without it, only public routes run and the
 * dashboard is reported as SKIPPED.
 *
 * Usage: BASE=http://localhost:3950 node scripts/verify-a11y.mjs
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const BASE = process.env.BASE || "http://localhost:3950";

const PUBLIC_ROUTES = ["/", "/login", "/signup", "/privacy", "/security", "/terms"];
const AUTH_ROUTES = ["/dashboard", "/dashboard/ask", "/dashboard/settings?tab=appearance"];

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING = new Set(["critical", "serious"]);

async function scan(page, route) {
  const res = await page.goto(BASE + route, { waitUntil: "networkidle" });
  if (!res || res.status() >= 400) {
    return { route, status: res ? res.status() : 0, error: "navigation failed", violations: [] };
  }
  await page.evaluate(AXE_SOURCE);
  const result = await page.evaluate(async (tags) => {
    // @ts-expect-error injected global
    return await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
  }, AXE_TAGS);
  const violations = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    help: v.help,
  }));
  return { route, status: res.status(), violations };
}

const browser = await chromium.launch();
const context = await browser.newContext();

const cookieSpec = process.env.ORIA_SESSION_COOKIE;
if (cookieSpec && cookieSpec.includes("=")) {
  const idx = cookieSpec.indexOf("=");
  const name = cookieSpec.slice(0, idx);
  const value = cookieSpec.slice(idx + 1);
  const { hostname } = new URL(BASE);
  await context.addCookies([{ name, value, domain: hostname, path: "/" }]);
}

const page = await context.newPage();
const routes = [...PUBLIC_ROUTES, ...(cookieSpec ? AUTH_ROUTES : [])];

let blockingTotal = 0;
const report = [];
for (const route of routes) {
  try {
    const r = await scan(page, route);
    const blocking = r.violations.filter((v) => BLOCKING.has(v.impact));
    blockingTotal += blocking.length;
    report.push({ ...r, blocking: blocking.length });
    const tag = blocking.length === 0 ? "PASS" : "FAIL";
    console.log(`${tag}  ${route}  (${r.violations.length} total, ${blocking.length} critical/serious)`);
    for (const v of blocking) {
      console.log(`        [${v.impact}] ${v.id}: ${v.help} (${v.nodes} node(s))`);
    }
  } catch (err) {
    console.log(`ERROR ${route}  -> ${err instanceof Error ? err.message : err}`);
    blockingTotal += 1;
  }
}

if (!cookieSpec) {
  console.log(`SKIP  authenticated routes (${AUTH_ROUTES.join(", ")}) -> set ORIA_SESSION_COOKIE to include`);
}

await browser.close();

console.log(`\naxe-core: ${blockingTotal} critical/serious violation(s) across ${routes.length} route(s)`);
process.exit(blockingTotal === 0 ? 0 : 1);
