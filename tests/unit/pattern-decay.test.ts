import { describe, it, expect } from "vitest";
import { decayStep, DEFAULT_DECAY_FACTOR } from "@/lib/patterns/decay";

// Round 14.6 F1: unreinforced patterns age down over time; recently reinforced
// ones persist; patterns that fall below the floor are pruned.

const DAY = 86_400_000;
const dayStart = Date.UTC(2026, 5, 4); // 2026-06-04 00:00 UTC

describe("decayStep", () => {
  it("keeps a pattern reinforced today unchanged (reinforced persists)", () => {
    const step = decayStep({
      score: 3.2,
      lastObservedAtMs: dayStart + 5 * 3_600_000,
      dayStartMs: dayStart,
    });
    expect(step).toEqual({ action: "keep", score: 3.2 });
  });

  it("decays a stale pattern by the factor", () => {
    const step = decayStep({
      score: 2,
      lastObservedAtMs: dayStart - 3 * DAY,
      dayStartMs: dayStart,
    });
    expect(step.action).toBe("update");
    expect(step.score).toBeCloseTo(2 * DEFAULT_DECAY_FACTOR, 5);
  });

  it("prunes a stale pattern once it falls below the floor", () => {
    const step = decayStep({
      score: 0.05,
      lastObservedAtMs: dayStart - 10 * DAY,
      dayStartMs: dayStart,
      factor: 0.9,
      floor: 0.05,
    });
    expect(step.action).toBe("delete"); // 0.045 < 0.05
  });

  it("monotonically decreases over repeated unreinforced days, then prunes", () => {
    let score = 1;
    const factor = 0.9;
    const floor = 0.05;
    let pruned = false;
    let last = Infinity;
    for (let day = 1; day <= 40 && !pruned; day++) {
      const step = decayStep({
        score,
        lastObservedAtMs: dayStart - day * DAY, // always stale
        dayStartMs: dayStart,
        factor,
        floor,
      });
      if (step.action === "delete") {
        pruned = true;
        break;
      }
      expect(step.score).toBeLessThan(last);
      last = step.score;
      score = step.score;
    }
    expect(pruned).toBe(true); // a never-reinforced pattern eventually fades out
  });
});
