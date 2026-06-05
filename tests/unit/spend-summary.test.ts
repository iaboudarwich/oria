import { describe, it, expect } from "vitest";
import { summarizeSpend } from "@/lib/sections/spend-summary";
import type { BillItem } from "@/lib/data/smart-sections";

/**
 * The home Spending ring and the Finance spend visuals share this one pure
 * aggregation, so a regression in month bucketing, the month-over-month delta,
 * the category shares, or the empty-data signal surfaces here, not in a
 * screenshot. Every figure must come from real amounts; no spend -> hasData
 * false (callers show an empty state, never an invented number).
 */

const now = new Date("2026-06-15T12:00:00Z");

function bill(p: Partial<BillItem>): BillItem {
  return {
    id: "x",
    upload_id: null,
    title: null,
    summary: null,
    merchant: null,
    amount_value: null,
    amount_currency: "USD",
    amount_normalized: null,
    occurred_at: null,
    location: null,
    is_recurring: null,
    recurring_interval: null,
    category: null,
    confidence: null,
    ...p,
  } as BillItem;
}

describe("summarizeSpend", () => {
  it("reports no data for an empty / amount-less set", () => {
    expect(summarizeSpend([], now).hasData).toBe(false);
    expect(
      summarizeSpend([bill({ occurred_at: "2026-06-01T00:00:00Z" })], now).hasData,
    ).toBe(false); // no amount_normalized
  });

  it("sums this month and last month, and the MoM delta", () => {
    const bills = [
      bill({ amount_normalized: 100, occurred_at: "2026-06-03T00:00:00Z" }),
      bill({ amount_normalized: 200, occurred_at: "2026-06-10T00:00:00Z" }),
      bill({ amount_normalized: 250, occurred_at: "2026-05-12T00:00:00Z" }),
    ];
    const s = summarizeSpend(bills, now);
    expect(s.hasData).toBe(true);
    expect(s.thisMonth).toBe(300);
    expect(s.lastMonth).toBe(250);
    expect(s.deltaPct).toBe(20); // (300-250)/250
    expect(s.currency).toBe("USD");
  });

  it("delta is null when there is no last-month spend", () => {
    const s = summarizeSpend(
      [bill({ amount_normalized: 100, occurred_at: "2026-06-03T00:00:00Z" })],
      now,
    );
    expect(s.deltaPct).toBeNull();
  });

  it("builds 12 monthly buckets, today's month last", () => {
    const s = summarizeSpend(
      [bill({ amount_normalized: 100, occurred_at: "2026-06-03T00:00:00Z" })],
      now,
    );
    expect(s.monthly).toHaveLength(12);
    expect(s.monthly[11].value).toBe(100); // June, the last bucket
    expect(s.monthly[10].value).toBe(0); // May, nothing
  });

  it("ranks categories by amount with shares, folding the tail into Other", () => {
    const bills = [
      bill({ amount_normalized: 500, occurred_at: "2026-06-01T00:00:00Z", category: "Rent" }),
      bill({ amount_normalized: 300, occurred_at: "2026-06-01T00:00:00Z", category: "Groceries" }),
      bill({ amount_normalized: 200, occurred_at: "2026-06-01T00:00:00Z", category: "Utilities" }),
    ];
    const s = summarizeSpend(bills, now, 2); // topN=2 so Utilities folds into Other
    expect(s.categories.map((c) => c.label)).toEqual(["Rent", "Groceries", "Other"]);
    expect(s.categories[0].amount).toBe(500);
    expect(s.categories[0].share).toBeCloseTo(0.5, 5);
    expect(s.categories[2].amount).toBe(200); // Other = Utilities
  });
});
