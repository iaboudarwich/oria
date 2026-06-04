#!/usr/bin/env node
/**
 * Accessibility verification (Round 14.8 F1/F2). Drives a real Chromium against
 * a running server (`next start`) and runs axe-core (WCAG 2.0/2.1 A + AA) on a
 * set of routes, asserting ZERO critical or serious violations (heuristics §5).
 *
 * axe-core is injected from node_modules (no @axe-core/playwright dependency),
 * matching the repo convention of self-contained verification scripts
 * (see scripts/verify-pwa.mjs).
 *
 * Public routes scan unauthenticated. If the Supabase service-role + anon keys
 * are present (.env.local) it also mints a session for a dev test identity
 * (override with ORIA_A11Y_EMAIL / ORIA_A11Y_ORG) and scans the authenticated
 * dashboard routes, where the two-rail, skip link, <main> landmark, and the
 * appearance controls live. Without keys the dashboard is reported SKIPPED.
 *
 * Usage: BASE=http://localhost:3950 node scripts/verify-a11y.mjs
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";

try {
  process.loadEnvFile(".env.local");
} catch {
  // creds may already be in env (CI); public routes still run.
}

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const BASE = process.env.BASE || "http://localhost:3950";

const PUBLIC_ROUTES = ["/", "/login", "/signup", "/privacy", "/security", "/terms"];
const AUTH_ROUTES = ["/dashboard", "/dashboard/ask", "/dashboard/settings?tab=appearance"];

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING = new Set(["critical", "serious"]);

// Dev test identity for the authenticated scan (same user the scope-isolation
// test uses). Override via env for other environments.
const A11Y_EMAIL = process.env.ORIA_A11Y_EMAIL || "issamabdar@gmail.com";
const A11Y_ORG = process.env.ORIA_A11Y_ORG || "40ba99b8-4a1e-4e91-89f7-26aa34239a46";

/** Mint Supabase auth cookies for the dev test identity, or null if not possible. */
async function mintAuthCookies() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !srk || !anonKey) return null;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(url, srk, { auth: { persistSession: false } });
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: A11Y_EMAIL });
    const otp = link.data.properties?.email_otp;
    const verify = await anon.auth.verifyOtp({ email: A11Y_EMAIL, token: otp, type: "email" });
    const session = verify.data.session;
    if (!session) return null;
    const ref = new URL(url).host.split(".")[0];
    const value =
      "base64-" +
      Buffer.from(JSON.stringify(session), "utf8")
        .toString("base64")
        .replace(/=+$/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    const name = `sb-${ref}-auth-token`;
    const CHUNK = 3200;
    const out = [];
    const host = new URL(BASE).hostname;
    if (value.length <= CHUNK) out.push({ name, value, domain: host, path: "/" });
    else
      for (let i = 0; i * CHUNK < value.length; i++)
        out.push({ name: `${name}.${i}`, value: value.slice(i * CHUNK, (i + 1) * CHUNK), domain: host, path: "/" });
    out.push({ name: "oria_active_org", value: A11Y_ORG, domain: host, path: "/" });
    out.push({ name: "oria_tz", value: "America/Los_Angeles", domain: host, path: "/" });
    return out;
  } catch {
    return null;
  }
}

async function scan(page, route) {
  const res = await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.evaluate(AXE_SOURCE);
  const result = await page.evaluate(async (tags) => {
    // @ts-expect-error injected global
    return await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
  }, AXE_TAGS);
  const violations = result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
  return { status: res ? res.status() : 0, url: page.url(), violations };
}

const browser = await chromium.launch();
const context = await browser.newContext();
const authCookies = await mintAuthCookies();
if (authCookies) await context.addCookies(authCookies);
const page = await context.newPage();
let pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

const routes = [...PUBLIC_ROUTES, ...(authCookies ? AUTH_ROUTES : [])];
// The gate is axe critical/serious (heuristics §5). Page errors are reported as
// informational warnings so a pre-existing, unrelated hydration warning can't
// turn the a11y gate red.
let axeBlocking = 0;
let warnings = 0;
for (const route of routes) {
  pageErrors = [];
  try {
    const r = await scan(page, route);
    const blocking = r.violations.filter((v) => BLOCKING.has(v.impact));
    axeBlocking += blocking.length;
    warnings += pageErrors.length;
    const tag = blocking.length === 0 ? "PASS" : "FAIL";
    console.log(`${tag}  ${route}  (${r.violations.length} total, ${blocking.length} critical/serious, ${pageErrors.length} page warning(s))`);
    for (const v of blocking) console.log(`        [${v.impact}] ${v.id}: ${v.help} (${v.nodes} node(s))`);
    for (const e of pageErrors) console.log(`        WARN pageerror: ${e}`);
  } catch (err) {
    console.log(`ERROR ${route}  -> ${err instanceof Error ? err.message : err}`);
    axeBlocking += 1;
  }
}

if (!authCookies) {
  console.log(`SKIP  authenticated routes -> set Supabase keys in .env.local to include the dashboard`);
}

await browser.close();
console.log(`\naxe-core: ${axeBlocking} critical/serious violation(s) across ${routes.length} route(s)${warnings ? ` (${warnings} page warning(s), see above)` : ""}`);
process.exit(axeBlocking === 0 ? 0 : 1);
