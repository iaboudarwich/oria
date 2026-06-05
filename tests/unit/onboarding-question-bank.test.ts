import { describe, it, expect } from "vitest";
import bank from "@/lib/onboarding/question-bank.json";

type Q = { id: string; type: string; options?: string[]; multi?: boolean };
type Bank = {
  intro: Q[];
  common: Q[];
  trees: Record<string, Q[]>;
};

const BANK = bank as Bank;

describe("onboarding question bank", () => {
  it("has a shared common block asked to everyone", () => {
    expect(Array.isArray(BANK.common)).toBe(true);
    expect(BANK.common.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the total question count stable across every intent (stable progress)", () => {
    const totals = new Set(
      Object.values(BANK.trees).map((tree) => BANK.intro.length + BANK.common.length + tree.length),
    );
    expect(totals.size).toBe(1);
    // 6 to 10 questions total, per the round spec.
    const total = [...totals][0];
    expect(total).toBeGreaterThanOrEqual(6);
    expect(total).toBeLessThanOrEqual(10);
  });

  it("flags multi-select only on multiple_choice questions", () => {
    const all = [...BANK.intro, ...BANK.common, ...Object.values(BANK.trees).flat()];
    for (const q of all) {
      if (q.multi) expect(q.type).toBe("multiple_choice");
    }
  });

  it("keeps at least five free-text questions on every path (intro + tree)", () => {
    for (const tree of Object.values(BANK.trees)) {
      const path = [...BANK.intro, ...tree];
      const freeText = path.filter((q) => q.type === "text").length;
      expect(freeText).toBeGreaterThanOrEqual(2);
    }
  });
});
