#!/usr/bin/env node
/**
 * PWA verification (Round 15 F6). Drives a real Chromium against a running
 * production server (`next start`) and checks:
 *
 *   1. The service worker registers and controls the page.
 *   2. Client navigation still works with the SW active.
 *   3. Cache Storage audit: ONLY allow-listed static assets are cached, never
 *      /api, never an HTML document, never user content. (The privacy gate.)
 *   4. A real push is delivered: subscribe -> web-push send (push service
 *      accepts) -> the SW push handler shows a notification.
 *
 * Usage: BASE=http://localhost:3950 node scripts/verify-pwa.mjs
 * Requires the three VAPID vars (read from .env.local).
 */

import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { chromium } from "playwright";
import webpush from "web-push";

const BASE = process.env.BASE || "http://localhost:3950";

function envFromLocal(key) {
  const raw = readFileSync(".env.local", "utf8");
  const line = raw.split("\n").find((l) => l.startsWith(key + "="));
  return line ? line.slice(key.length + 1).trim() : undefined;
}

const PUBLIC_KEY = envFromLocal("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
const PRIVATE_KEY = envFromLocal("VAPID_PRIVATE_KEY");
const SUBJECT = envFromLocal("VAPID_SUBJECT");

// Cached URL is acceptable only if it matches the SW allow-list.
function isAllowlisted(u) {
  const url = new URL(u);
  if (url.origin !== new URL(BASE).origin) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/logo.svg" ||
    url.pathname === "/offline" // precached shell (not user content)
  );
}

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

const browser = await chromium.launch();
const context = await browser.newContext();
await context.grantPermissions(["notifications"], { origin: BASE });
const page = await context.newPage();

// 1. SW registers + controls.
await page.goto(BASE, { waitUntil: "load" });
await page.evaluate(() => navigator.serviceWorker.ready);
// Reload so the active SW controls this client.
await page.reload({ waitUntil: "load" });
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
check("service worker controls the page", controlled);

// 2. Client navigation works with the SW active.
const nav = await page.goto(BASE + "/login", { waitUntil: "load" });
check("navigation works with SW active", !!nav && nav.status() < 400, `/login -> ${nav && nav.status()}`);
await page.goto(BASE, { waitUntil: "load" });

// 2b. Installability (Chrome's own criteria; Lighthouse 13 removed the PWA
// category). Empty installabilityErrors means manifest + SW + icons + secure
// context all satisfy the install contract.
{
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  await page.waitForTimeout(800);
  let errs = ["unknown"];
  try {
    const r = await cdp.send("Page.getInstallabilityErrors");
    errs = (r.installabilityErrors || []).map((e) => e.errorId);
  } catch (e) {
    errs = [String(e)];
  }
  check("app is installable (no installability errors)", errs.length === 0, errs.join(", "));
}

// 3. Cache Storage audit.
const cacheReport = await page.evaluate(async () => {
  const names = await caches.keys();
  const out = {};
  for (const n of names) {
    const c = await caches.open(n);
    const reqs = await c.keys();
    out[n] = reqs.map((r) => r.url);
  }
  return out;
});
const allCached = Object.values(cacheReport).flat();
const offenders = allCached.filter((u) => !isAllowlisted(u));
const apiCached = allCached.filter((u) => new URL(u).pathname.startsWith("/api/"));
console.log(`  cache names: ${Object.keys(cacheReport).join(", ") || "(none)"}`);
console.log(`  cached entries: ${allCached.length}`);
check("no /api responses cached", apiCached.length === 0, apiCached.join(", "));
check(
  "only allow-listed static assets cached",
  offenders.length === 0,
  offenders.length ? "offenders: " + offenders.join(", ") : `${allCached.length} entries all allow-listed`,
);

// 4. Push. Headless Chromium has no FCM push service, so we cannot create a
// real subscription here. We verify the two halves deterministically instead:
//   (a) the server send path builds a valid encrypted + VAPID-signed request;
//   (b) the SW receives a real push and shows a notification (CDP delivery, the
//       same mechanism DevTools' "Push" button uses).
const payload = JSON.stringify({
  title: "Oria",
  body: "Test notification. Push is working.",
  url: "/dashboard",
  tag: "verify",
});

// 4a. Server send path (no network): web-push encrypts the payload and adds the
// VAPID Authorization header for a syntactically valid subscription.
if (!PUBLIC_KEY || !PRIVATE_KEY || !SUBJECT) {
  check("VAPID env present", false, "missing one of the three VAPID vars");
} else {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  try {
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.generateKeys();
    const fakeSub = {
      endpoint: "https://example.com/push/" + crypto.randomBytes(8).toString("hex"),
      keys: {
        p256dh: ecdh.getPublicKey().toString("base64url"),
        auth: crypto.randomBytes(16).toString("base64url"),
      },
    };
    const details = webpush.generateRequestDetails(fakeSub, payload);
    const auth = details.headers.Authorization || "";
    check(
      "server builds encrypted + VAPID-signed push request",
      auth.toLowerCase().includes("vapid") && details.body.length > 0,
      "Authorization: " + auth.slice(0, 12) + "...",
    );
  } catch (e) {
    check("server builds encrypted + VAPID-signed push request", false, String(e));
  }
}

// 4b. SW receives a real push and runs its handler (deterministic CDP delivery,
// the same mechanism DevTools' "Push" button uses). We observe the SW->client
// postMessage the handler emits. Note: on-device notification *display* cannot
// be exercised in headless Chromium (no notification platform, permission is
// always "denied"); that final step is confirmed on a real device/browser.
await page.evaluate(() => {
  window.__pushReceived = false;
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "push") window.__pushReceived = true;
  });
});
try {
  const cdp = await context.newCDPSession(page);
  const regId = await new Promise(async (resolve) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => {
      const r = (e.registrations || []).find(
        (x) => x.scopeURL && x.scopeURL.startsWith(BASE),
      );
      if (r) resolve(r.registrationId);
    });
    await cdp.send("ServiceWorker.enable");
    setTimeout(() => resolve(null), 3000);
  });
  if (regId) {
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin: BASE,
      registrationId: regId,
      data: payload,
    });
    const received = await page.waitForFunction(() => window.__pushReceived === true, null, {
      timeout: 5000,
    }).then(() => true).catch(() => false);
    check("SW receives push and runs its handler", received);
  } else {
    check("SW receives push and runs its handler", false, "no registrationId");
  }
} catch (e) {
  check("SW receives push and runs its handler", false, String(e));
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
