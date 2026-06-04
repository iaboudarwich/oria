import { describe, it, expect } from "vitest";
import { decideAskLimit, hoursUntilReset } from "@/lib/ai/ask-limit";

// Round 14.6 F3: the daily Ask cap applies only to Oria-default users; BYO-key
// users self-pay and are exempt; the path degrades open if the limiter is
// unavailable. These pin the decision so the cost-control contract can't drift.

describe("decideAskLimit", () => {
  it("exempts BYO users regardless of the limiter", () => {
    expect(decideAskLimit({ isByo: true, limiter: null })).toEqual({ allowed: true });
    expect(
      decideAskLimit({ isByo: true, limiter: { success: false, limit: 100, reset: 1 } }),
    ).toEqual({ allowed: true });
  });

  it("allows a default-AI user under the limit", () => {
    expect(
      decideAskLimit({ isByo: false, limiter: { success: true, limit: 100, reset: 999 } }),
    ).toEqual({ allowed: true });
  });

  it("blocks a default-AI user at the limit, surfacing reset + limit", () => {
    const d = decideAskLimit({
      isByo: false,
      limiter: { success: false, limit: 100, reset: 1234 },
    });
    expect(d).toEqual({ allowed: false, limit: 100, resetAt: 1234 });
  });

  it("degrades open when the limiter is unavailable (Upstash unconfigured)", () => {
    expect(decideAskLimit({ isByo: false, limiter: null })).toEqual({ allowed: true });
  });
});

describe("hoursUntilReset", () => {
  it("rounds up and never returns less than one hour", () => {
    const now = 1_000_000;
    expect(hoursUntilReset(now + 3 * 3_600_000, now)).toBe(3);
    expect(hoursUntilReset(now + 3_600_000 + 1, now)).toBe(2);
    expect(hoursUntilReset(now - 5000, now)).toBe(1); // already past -> floor at 1
  });
});
