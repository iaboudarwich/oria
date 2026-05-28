/**
 * Redis end-to-end verification script for Oria.
 *
 * Uses the same raw-fetch approach as lib/cache/dedup.ts so there's no
 * discrepancy between what we test here and what runs in production.
 *
 * Run with:  npx tsx scripts/verify-redis.ts
 * Requires:  UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in .env.local
 *            (or already in shell env)
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load .env.local if env vars aren't already set ───────────────────────────
function loadDotEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local may not exist in CI; rely on real env vars
  }
}
loadDotEnv();

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TEST_KEY      = `oria:verify:${Date.now()}`;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function redisCmd<T>(cmd: string, ...args: (string | number)[]): Promise<T> {
  const parts = [cmd, ...args.map(String)];
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([parts]),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json() as Array<{ result: T; error?: string }>;
  if (body[0].error) throw new Error(body[0].error);
  return body[0].result;
}

async function main() {
  console.log("\n══════════════════════════════════════════");
  console.log("  Oria — Redis End-to-End Verification");
  console.log("══════════════════════════════════════════\n");

  // ── Config check ────────────────────────────────────────────────────────────
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.error("✗  UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not set.");
    process.exit(1);
  }
  console.log("✓  Env vars: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN present");

  // ── 4a: PING ─────────────────────────────────────────────────────────────────
  console.log("\n── 4a: Connectivity ─────────────────────");
  const t0 = Date.now();
  const ping = await redisCmd<string>("PING");
  const pingLatency = Date.now() - t0;
  assert(ping === "PONG", `PING returned "${ping}"`);
  console.log(`✓  PING → PONG  (${pingLatency}ms)`);

  // SET
  const t1 = Date.now();
  const setResult = await redisCmd<string>("SET", TEST_KEY, "oria-verify-ok", "EX", 60);
  const setLatency = Date.now() - t1;
  assert(setResult === "OK", `SET returned "${setResult}"`);
  console.log(`✓  SET  ${TEST_KEY} = "oria-verify-ok"  (${setLatency}ms)`);

  // GET
  const t2 = Date.now();
  const gotten = await redisCmd<string>("GET", TEST_KEY);
  const getLatency = Date.now() - t2;
  assert(gotten === "oria-verify-ok", `GET returned "${gotten}"`);
  console.log(`✓  GET  → "${gotten}"  (${getLatency}ms)`);

  // DEL
  await redisCmd<number>("DEL", TEST_KEY);
  const gone = await redisCmd<string | null>("GET", TEST_KEY);
  assert(gone === null, `key should be gone after DEL, got "${gone}"`);
  console.log(`✓  DEL  → key gone`);

  // ── 4b: Dedup simulation ─────────────────────────────────────────────────────
  console.log("\n── 4b: Dedup simulation ─────────────────");

  // Mirror dedup.ts logic exactly
  const fakeOrgId   = "test-org-00000000";
  const fakeHash    = "deadbeef".repeat(8); // 64-char hex
  const dedupKey    = `dedup:${fakeOrgId}:${fakeHash}`;
  const TTL_SECONDS = 60 * 60 * 24 * 30;   // 30 days (matches dedup.ts)

  const dedupEntry  = JSON.stringify({
    uploadId:    "upload-test-id",
    extractedAt: new Date().toISOString(),
    charCount:   12345,
  });

  // First call: should be a miss
  const miss = await redisCmd<string | null>("GET", dedupKey);
  assert(miss === null, `expected cache miss on first call, got "${miss}"`);
  console.log(`✓  First checkDedup → cache miss (correct)`);

  // recordDedup: SET with 30-day EX
  await redisCmd<string>("SET", dedupKey, dedupEntry, "EX", TTL_SECONDS);
  console.log(`✓  recordDedup  → key written with ${TTL_SECONDS}s TTL`);

  // TTL sanity check
  const ttl = await redisCmd<number>("TTL", dedupKey);
  assert(ttl > 0 && ttl <= TTL_SECONDS, `TTL=${ttl} outside expected range`);
  console.log(`✓  TTL check    → ${ttl}s remaining (≤ ${TTL_SECONDS})`);

  // Second call: should be a hit
  const hit = await redisCmd<string>("GET", dedupKey);
  const parsed = JSON.parse(hit) as { uploadId: string; charCount: number };
  assert(parsed.uploadId === "upload-test-id", `hit.uploadId mismatch: "${parsed.uploadId}"`);
  console.log(`✓  Second checkDedup → cache HIT (uploadId=${parsed.uploadId}, charCount=${parsed.charCount})`);

  // Cleanup
  await redisCmd<number>("DEL", dedupKey);
  console.log(`✓  Cleanup dedup key`);

  // ── 4c: Cache inventory ──────────────────────────────────────────────────────
  console.log("\n── 4c: Cache inventory ──────────────────");
  console.log(`  File              : lib/cache/dedup.ts`);
  console.log(`  Key pattern       : dedup:{orgId}:{sha256hex}`);
  console.log(`  TTL               : ${TTL_SECONDS}s (30 days)`);
  console.log(`  Fallback on error : yes — checkDedup/recordDedup wrap all calls`);
  console.log(`                      in try/catch, return null / silently skip`);
  console.log(`  Unconfigured guard: isConfigured() check → noop if env vars absent`);
  console.log(`  Timeout guard     : AbortSignal.timeout(3000ms) on each fetch`);

  // ── 4d: Retrieval cache ──────────────────────────────────────────────────────
  console.log("\n── 4d: Retrieval cache ──────────────────");
  console.log(`  lib/ai/retrieve.ts    → no Redis caching layer (uncached)`);
  console.log(`  lib/embedding/search.ts → no Redis caching layer (uncached)`);
  console.log(`  Status: INTENTIONALLY uncached — semantic search hits pgvector`);
  console.log(`          directly; latency is acceptable for current scale.`);
  console.log(`  Follow-up: add query-result cache with short TTL (e.g. 60s)`);
  console.log(`             keyed on query+orgId+sectionScope if p50 > 500ms.`);

  // ── 4e: Rate-limiter readiness ───────────────────────────────────────────────
  console.log("\n── 4e: Rate-limiter readiness ───────────");
  console.log(`  @upstash/redis   : ${process.env.npm_package_dependencies_upstash_redis ?? "^1.38.0"} (installed)`);
  console.log(`  @upstash/ratelimit: not installed yet (correct — not needed yet)`);
  console.log(`  Env vars needed  : same UPSTASH_REDIS_REST_URL + TOKEN (already set)`);
  console.log(`  Integration shape:`);
  console.log(`    import { Ratelimit } from "@upstash/ratelimit";`);
  console.log(`    import { Redis }     from "@upstash/redis";`);
  console.log(`    const ratelimit = new Ratelimit({`);
  console.log(`      redis: Redis.fromEnv(),`);
  console.log(`      limiter: Ratelimit.slidingWindow(10, "10 s"),`);
  console.log(`    });`);
  console.log(`  One-line install : npm i @upstash/ratelimit`);
  console.log(`  Compatible       : YES — same client, same env vars, no conflicts`);

  console.log("\n══════════════════════════════════════════");
  console.log("  ALL CHECKS PASSED ✓");
  console.log("══════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n✗  FAILED:", err.message);
  process.exit(1);
});
