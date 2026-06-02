/**
 * Tiny generic string cache over Upstash Redis (REST), used for short-lived
 * caches like fetched Drive content. Mirrors the request shape in
 * lib/cache/dedup.ts. No-ops gracefully when Upstash is not configured.
 *
 * Requires env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function isConfigured(): boolean {
  return Boolean(UPSTASH_URL && UPSTASH_TOKEN);
}

async function redisCmd<T>(parts: (string | number)[]): Promise<T | null> {
  try {
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
    const json = (await res.json()) as Array<{ result: T; error?: string }>;
    if (json[0]?.error) return null;
    return json[0]?.result ?? null;
  } catch {
    return null;
  }
}

export async function kvGet(key: string): Promise<string | null> {
  if (!isConfigured()) return null;
  return redisCmd<string>(["GET", key]);
}

export async function kvSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (!isConfigured()) return;
  await redisCmd<string>(["SET", key, value, "EX", ttlSeconds]);
}
