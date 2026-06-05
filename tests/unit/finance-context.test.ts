import { describe, it, expect } from "vitest";
import { buildFinanceContextBlock } from "@/lib/ai/finance-context";
import { computeNetWorth } from "@/lib/net-worth/compute";

describe("buildFinanceContextBlock", () => {
  it("returns null when there are no holdings", () => {
    const nw = computeNetWorth([]);
    expect(buildFinanceContextBlock(nw)).toBeNull();
  });

  it("states net worth and the 1% figure", () => {
    const nw = computeNetWorth([
      { kind: "cash", amount: 80000, currency: "USD" },
      { kind: "crypto", amount: 20000, currency: "USD" },
    ]);
    const block = buildFinanceContextBlock(nw);
    expect(block).toContain("FINANCE CONTEXT");
    expect(block).toContain("100,000 USD");
    // 1% of 100k = 1,000.
    expect(block).toContain("1,000 USD");
  });

  it("contains no em-dash", () => {
    const nw = computeNetWorth([{ kind: "cash", amount: 5000, currency: "EUR" }]);
    expect(buildFinanceContextBlock(nw)).not.toContain("—");
  });
});
