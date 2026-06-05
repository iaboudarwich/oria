import { describe, it, expect } from "vitest";
import {
  computeNetWorth,
  allocationSlices,
  LIABILITY_KINDS,
  type AssetInput,
} from "@/lib/net-worth/compute";

const a = (
  kind: AssetInput["kind"],
  amount: number,
  currency = "USD",
  exclude = false,
): AssetInput => ({ kind, amount, currency, exclude_from_insights: exclude });

describe("computeNetWorth", () => {
  it("sums assets and subtracts debts", () => {
    const nw = computeNetWorth([a("cash", 1000), a("crypto", 500), a("debt", 300)]);
    expect(nw.totalAssets).toBe(1500);
    expect(nw.totalLiabilities).toBe(300);
    expect(nw.netWorth).toBe(1200);
    expect(nw.currency).toBe("USD");
  });

  it("reflects a crypto holding in the by-kind allocation", () => {
    const nw = computeNetWorth([a("cash", 1000), a("crypto", 500)]);
    expect(nw.byKind.crypto).toBe(500);
    const slices = allocationSlices(nw);
    const crypto = slices.find((s) => s.kind === "crypto");
    expect(crypto?.value).toBe(500);
    expect(crypto?.share).toBeCloseTo(500 / 1500);
  });

  it("excludes holdings flagged exclude_from_insights", () => {
    const nw = computeNetWorth([a("cash", 1000), a("crypto", 999, "USD", true)]);
    expect(nw.totalAssets).toBe(1000);
    expect(nw.byKind.crypto).toBeUndefined();
  });

  it("picks the primary currency by total value and lists the rest", () => {
    const nw = computeNetWorth([
      a("cash", 100, "EUR"),
      a("cash", 5000, "USD"),
      a("crypto", 200, "GBP"),
    ]);
    expect(nw.currency).toBe("USD");
    expect(nw.netWorth).toBe(5000);
    expect(nw.otherCurrencies.sort()).toEqual(["EUR", "GBP"]);
  });

  it("treats debt as the only liability kind", () => {
    expect(LIABILITY_KINDS.has("debt")).toBe(true);
    expect(LIABILITY_KINDS.has("property")).toBe(false);
  });

  it("returns no slices when there is no positive value", () => {
    const nw = computeNetWorth([a("debt", 500)]);
    expect(allocationSlices(nw)).toEqual([]);
    expect(nw.netWorth).toBe(-500);
  });

  it("uses absolute amounts so a debt entered as negative still counts once", () => {
    const nw = computeNetWorth([a("cash", 1000), a("debt", -200)]);
    expect(nw.totalLiabilities).toBe(200);
    expect(nw.netWorth).toBe(800);
  });
});
