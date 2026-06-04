import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Per-user DAILY Ask Oria limit (Round 14.6 F3).
 *
 * Scope: applies ONLY to users on Oria's default Anthropic key (Oria pays those
 * tokens). BYO-key users self-pay and are EXEMPT. Durable + cross-instance via
 * @upstash/ratelimit on the Upstash Redis already in the stack, so the cap holds
 * across Fluid Compute instances (unlike the in-process burst limiter, which it
 * complements rather than replaces). Degrades OPEN: if Upstash is not configured
 * or errors, the request is allowed rather than hard-failed.
 *
 * The daily allowance is env-configurable (ORIA_ASK_DAILY_LIMIT, default 100).
 */

export type AskLimitDecision =
  | { allowed: true }
  | { allowed: false; limit: number; resetAt: number };

/** Pure decision so the policy is unit-testable without Redis. */
export function decideAskLimit(input: {
  isByo: boolean;
  limiter: { success: boolean; limit: number; reset: number } | null;
}): AskLimitDecision {
  if (input.isByo) return { allowed: true }; // BYO self-pays: exempt
  if (!input.limiter) return { allowed: true }; // Upstash unconfigured/errored: degrade open
  if (input.limiter.success) return { allowed: true };
  return { allowed: false, limit: input.limiter.limit, resetAt: input.limiter.reset };
}

export function askDailyLimit(): number {
  const raw = process.env.ORIA_ASK_DAILY_LIMIT;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 100;
}

let cached: Ratelimit | null = null;
let constructionFailed = false;
function limiter(): Ratelimit | null {
  if (constructionFailed) return null;
  if (cached) return cached;
  // Trim the env values: a stray trailing newline or surrounding whitespace in
  // the dashboard secret makes @upstash/redis throw at construction ("The redis
  // url contains whitespace or newline"), which previously escaped the daily
  // limit check and 500'd every Ask. Trim defensively, and wrap construction so
  // ANY misconfiguration degrades the limit OPEN instead of breaking Ask.
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  try {
    cached = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.fixedWindow(askDailyLimit(), "1 d"),
      prefix: "oria:ask:daily",
      analytics: false,
    });
    return cached;
  } catch {
    // Malformed URL/token, unreachable host config, etc. Never let the rate
    // limiter take down Ask: remember the failure and degrade open.
    constructionFailed = true;
    return null;
  }
}

/**
 * Decide whether this user may Ask right now. BYO users short-circuit before
 * any Redis call (never consume a token). Default users consume one token from
 * their daily window. Never throws.
 */
export async function checkAskDailyLimit(
  userId: string,
  isByo: boolean,
): Promise<AskLimitDecision> {
  if (isByo) return decideAskLimit({ isByo: true, limiter: null });
  try {
    const rl = limiter();
    if (!rl) return decideAskLimit({ isByo: false, limiter: null });
    const r = await rl.limit(`u:${userId}`);
    return decideAskLimit({
      isByo: false,
      limiter: { success: r.success, limit: r.limit, reset: r.reset },
    });
  } catch {
    return { allowed: true }; // degrade open on ANY limiter error
  }
}

/** Hours (rounded up, min 1) until a blocked user's window resets. */
export function hoursUntilReset(resetAtMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((resetAtMs - nowMs) / 3_600_000));
}
