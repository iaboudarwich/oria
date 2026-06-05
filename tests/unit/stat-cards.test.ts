import { describe, it, expect } from "vitest";
import {
  defaultStatCards,
  resolveStatCards,
  parseCardPrefs,
  type CardSignals,
} from "@/lib/daily/stat-cards";
import { bucketForHour, bucketByTime } from "@/lib/daily/time-buckets";

const base: CardSignals = {
  archetype: "personal",
  hasHealth: false,
  hasRituals: false,
  hasFinance: false,
  hasBills: false,
};

describe("defaultStatCards (per-archetype tailoring)", () => {
  it("personal with nothing connected shows only context + agenda", () => {
    expect(defaultStatCards(base)).toEqual(["context", "agenda"]);
  });

  it("includes health only when health or rituals are present", () => {
    expect(defaultStatCards({ ...base, hasRituals: true })).toContain("health");
    expect(defaultStatCards(base)).not.toContain("health");
  });

  it("an investor leads with net worth + spend over health", () => {
    const cards = defaultStatCards({
      archetype: "investor",
      hasHealth: true,
      hasRituals: false,
      hasFinance: true,
      hasBills: true,
    });
    expect(cards[0]).toBe("context");
    expect(cards.indexOf("net_worth")).toBeLessThan(cards.indexOf("health"));
    expect(cards.indexOf("spend")).toBeLessThan(cards.indexOf("health"));
  });

  it("net_worth needs finance, spend/subscriptions need bills", () => {
    expect(defaultStatCards({ ...base, hasFinance: true })).toContain("net_worth");
    expect(defaultStatCards({ ...base, hasFinance: true })).not.toContain("spend");
    expect(defaultStatCards({ ...base, hasBills: true })).toEqual(
      expect.arrayContaining(["spend", "subscriptions"]),
    );
  });
});

describe("resolveStatCards (merge user prefs)", () => {
  const available = ["context", "agenda", "health"] as const;

  it("keeps the user's order and hidden flags for available cards", () => {
    const prefs = [
      { key: "health" as const, hidden: false },
      { key: "context" as const, hidden: true },
    ];
    const r = resolveStatCards([...available], prefs);
    // user order first (health, context), then the new available card (agenda).
    expect(r.map((c) => c.key)).toEqual(["health", "context", "agenda"]);
    expect(r.find((c) => c.key === "context")?.hidden).toBe(true);
    expect(r.find((c) => c.key === "agenda")?.hidden).toBe(false);
  });

  it("drops prefs for cards that no longer apply", () => {
    const prefs = [{ key: "net_worth" as const, hidden: false }];
    const r = resolveStatCards([...available], prefs);
    expect(r.map((c) => c.key)).not.toContain("net_worth");
  });

  it("parseCardPrefs ignores junk and dedupes", () => {
    const parsed = parseCardPrefs([
      { key: "health", hidden: true },
      { key: "nope" },
      { key: "health", hidden: false },
      "garbage",
    ]);
    expect(parsed).toEqual([{ key: "health", hidden: true }]);
  });
});

describe("time buckets", () => {
  it("buckets by local hour", () => {
    expect(bucketForHour(8)).toBe("morning");
    expect(bucketForHour(12)).toBe("afternoon");
    expect(bucketForHour(16)).toBe("afternoon");
    expect(bucketForHour(17)).toBe("evening");
    expect(bucketForHour(22)).toBe("evening");
  });

  it("groups items, undated to anytime", () => {
    const r = bucketByTime(
      [
        { whenISO: "2026-06-05T08:00:00Z" },
        { whenISO: "2026-06-05T13:00:00Z" },
        { whenISO: "2026-06-05T19:00:00Z" },
        { whenISO: null },
      ],
      "UTC",
    );
    expect(r.morning.length).toBe(1);
    expect(r.afternoon.length).toBe(1);
    expect(r.evening.length).toBe(1);
    expect(r.anytime.length).toBe(1);
  });
});
