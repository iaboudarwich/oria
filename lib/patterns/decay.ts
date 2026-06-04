/**
 * Pattern-memory decay (Round 14.6).
 *
 * The daily cron ages unreinforced patterns down so stale behavior fades while
 * recently-reinforced patterns persist. Decay is a once-per-day multiplicative
 * step: a pattern observed since the start of the local cron day is left alone;
 * an older one has its score multiplied by a factor < 1, and once it falls below
 * a floor the row is pruned. Pure and idempotent-per-day so the cron is safe to
 * re-run and so the behavior is unit-testable without a database.
 */

export const DEFAULT_DECAY_FACTOR = 0.9;
export const DEFAULT_DECAY_FLOOR = 0.05;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export type DecayStep =
  | { action: "keep"; score: number }
  | { action: "update"; score: number }
  | { action: "delete"; score: number };

/**
 * Decide what the daily decay pass should do with one pattern row.
 *   - reinforced today (lastObserved >= dayStart) -> keep (persist)
 *   - otherwise -> multiply by factor; prune if below floor.
 */
export function decayStep(input: {
  score: number;
  lastObservedAtMs: number;
  dayStartMs: number;
  factor?: number;
  floor?: number;
}): DecayStep {
  const factor = input.factor ?? DEFAULT_DECAY_FACTOR;
  const floor = input.floor ?? DEFAULT_DECAY_FLOOR;
  if (input.lastObservedAtMs >= input.dayStartMs) {
    return { action: "keep", score: input.score };
  }
  const next = round4(input.score * factor);
  if (next < floor) return { action: "delete", score: next };
  return { action: "update", score: next };
}

/** Read decay factor / floor from env, falling back to the defaults. */
export function decayConfig(): { factor: number; floor: number } {
  const f = Number(process.env.ORIA_PATTERN_DECAY_FACTOR);
  const fl = Number(process.env.ORIA_PATTERN_DECAY_FLOOR);
  return {
    factor: Number.isFinite(f) && f > 0 && f < 1 ? f : DEFAULT_DECAY_FACTOR,
    floor: Number.isFinite(fl) && fl > 0 ? fl : DEFAULT_DECAY_FLOOR,
  };
}
