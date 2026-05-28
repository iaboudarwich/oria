/**
 * File deduplication via Upstash Redis.
 *
 * Key schema:  dedup:{orgId}:{sha256}
 * Value:       JSON { uploadId, extractedAt, charCount }
 * TTL:         30 days
 *
 * When the Python service is unavailable (no file_hash returned), dedup
 * is skipped and the caller proceeds with a fresh extraction.
 *
 * Requires env vars:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface DedupEntry {
  uploadId: string;
  extractedAt: string;
  charCount: number;
}

function isConfigured(): boolean {
  return Boolean(UPSTASH_URL && UPSTASH_TOKEN);
}

function dedupKey(orgId: string, fileHash: string): string {
  return `dedup:${orgId}:${fileHash}`;
}

/**
 * Execute a single Redis command via the Upstash pipeline endpoint.
 * Using /pipeline with [["CMD", arg1, arg2, ...]] is the canonical
 * Upstash REST format that handles TTL options correctly. The simpler
 * /set/{key} + body-array form treats the body as the literal value.
 */
async function redisCmd<T>(parts: (string | number)[]): Promise<T | null> {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([parts]),
    signal: AbortSignal.timeout(3_000),
  });
  if (!res.ok) return null;
  const json = await res.json() as Array<{ result: T; error?: string }>;
  if (json[0]?.error) return null;
  return json[0]?.result ?? null;
}

async function redisGet(key: string): Promise<string | null> {
  return redisCmd<string>(["GET", key]);
}

async function redisSet(key: string, value: string, ex: number): Promise<void> {
  await redisCmd<string>(["SET", key, value, "EX", ex]);
}

/**
 * Check if we've already extracted this exact file for this org.
 * Returns the cached DedupEntry, or null if no cache hit.
 */
export async function checkDedup(
  orgId: string,
  fileHash: string
): Promise<DedupEntry | null> {
  if (!isConfigured() || !fileHash) return null;

  try {
    const raw = await redisGet(dedupKey(orgId, fileHash));
    if (!raw) return null;
    return JSON.parse(raw) as DedupEntry;
  } catch (err) {
    console.warn("[cache/dedup] checkDedup error:", err);
    return null;
  }
}

/**
 * Record that we've extracted a file, so future uploads of the same
 * file by the same org skip re-extraction.
 */
export async function recordDedup(
  orgId: string,
  fileHash: string,
  entry: DedupEntry
): Promise<void> {
  if (!isConfigured() || !fileHash) return;

  try {
    await redisSet(
      dedupKey(orgId, fileHash),
      JSON.stringify(entry),
      TTL_SECONDS
    );
  } catch (err) {
    console.warn("[cache/dedup] recordDedup error:", err);
  }
}
