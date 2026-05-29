import "server-only";

/**
 * Burst rate limiter. in-process, sliding window.
 *
 * Complements the per-user DAILY quotas in lib/data/quotas.ts. Daily
 * caps stop steady abuse over hours; this stops short bursts (a user
 * holding Enter on Ask Oria, a misbehaving script firing 200 requests
 * a second). At 5–20 beta users this is plenty. Vercel Fluid Compute
 * reuses instances so the in-memory window survives many requests,
 * and a cold start at worst forfeits a small extra burst.
 *
 * The limiter never throws and never persists. If memory pressure or
 * a process bounce loses state, the next request just starts a fresh
 * window. Hard limits live in the DB (quotas).
 */

type Bucket = {
  /** Timestamps of recent hits, oldest first. Trimmed lazily on check. */
  hits: number[];
};

const STORE = new Map<string, Bucket>();

/** How many entries we keep alive before GC. Keeps memory bounded
 *  even if every IP/user gets a unique key on a hot box. */
const MAX_KEYS = 5000;

export type RateLimitCheck =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number; message: string };

export function rateLimit(input: {
  /** Stable key for the caller. Usually `userId:routeName`. */
  key: string;
  /** Max hits allowed in the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Human-readable label used in the error message ("Ask Oria", "search"). */
  label?: string;
}): RateLimitCheck {
  const now = Date.now();
  const windowStart = now - input.windowMs;

  // Best-effort eviction so we don't grow without bound on a long-lived
  // function instance. When the table is huge, drop the oldest 10%.
  if (STORE.size > MAX_KEYS) {
    const overflow = Math.ceil(STORE.size * 0.1);
    let dropped = 0;
    for (const k of STORE.keys()) {
      STORE.delete(k);
      if (++dropped >= overflow) break;
    }
  }

  const bucket = STORE.get(input.key) ?? { hits: [] };
  // Trim hits that fell off the window.
  while (bucket.hits.length > 0 && bucket.hits[0] < windowStart) {
    bucket.hits.shift();
  }

  if (bucket.hits.length >= input.limit) {
    const oldest = bucket.hits[0] ?? now;
    const retryMs = Math.max(0, oldest + input.windowMs - now);
    return {
      ok: false,
      retryAfterSeconds: Math.ceil(retryMs / 1000),
      message: `You're going too fast on ${input.label ?? "this action"}. Try again in a moment.`,
    };
  }

  bucket.hits.push(now);
  STORE.set(input.key, bucket);
  return { ok: true, remaining: Math.max(0, input.limit - bucket.hits.length) };
}

/**
 * Standard per-route limits. Read from env so we can loosen for a
 * specific endpoint without redeploying.
 *
 *   ORIA_RATE_ASK_PER_MIN          (default 30)
 *   ORIA_RATE_SEARCH_PER_MIN       (default 90)
 *   ORIA_RATE_WORK_AGENT_PER_MIN   (default 20)
 *   ORIA_RATE_REPORT_PER_HOUR      (default 20)
 *   ORIA_RATE_UPLOAD_PER_MIN       (default 20)
 */
export const RATE_PRESETS = {
  ask: () => ({
    limit: envInt("ORIA_RATE_ASK_PER_MIN", 30),
    windowMs: 60_000,
    label: "Ask Oria",
  }),
  search: () => ({
    limit: envInt("ORIA_RATE_SEARCH_PER_MIN", 90),
    windowMs: 60_000,
    label: "search",
  }),
  workAgent: () => ({
    limit: envInt("ORIA_RATE_WORK_AGENT_PER_MIN", 20),
    windowMs: 60_000,
    label: "the Work agent",
  }),
  report: () => ({
    limit: envInt("ORIA_RATE_REPORT_PER_HOUR", 20),
    windowMs: 60 * 60_000,
    label: "report generation",
  }),
  upload: () => ({
    limit: envInt("ORIA_RATE_UPLOAD_PER_MIN", 20),
    windowMs: 60_000,
    label: "uploads",
  }),
  /** Data export. 1 download per user per 24 h. */
  export: () => ({
    limit: 1,
    windowMs: 24 * 60 * 60_000,
    label: "data export",
  }),
  /** MFA code verification. 5 attempts per 15 minutes per user. Tight
   *  because a thief with the password is online-attacking a 6-digit
   *  TOTP; at 10^6 keyspace, 5 per 15-min keeps the brute-force ceiling
   *  far above the rotation window of the code itself. */
  mfaVerify: () => ({
    limit: envInt("ORIA_RATE_MFA_VERIFY_PER_15M", 5),
    windowMs: 15 * 60_000,
    label: "MFA verification",
  }),
} as const;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
