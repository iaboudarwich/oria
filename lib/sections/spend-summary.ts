import type { BillItem } from "@/lib/data/smart-sections";

/**
 * Pure spend aggregation over the user's real bill/receipt items (memory_items,
 * smart_section="bills"). No DB, no IO, fully unit-tested, so the home Spending
 * ring and the Finance spend visuals read the SAME numbers. Every figure here
 * is summed from real `amount_normalized`; nothing is invented. When there is no
 * spend at all, `hasData` is false and callers show an empty state.
 */

export type SpendCategory = { label: string; amount: number; share: number };

export type SpendSummary = {
  hasData: boolean;
  currency: string;
  thisMonth: number;
  lastMonth: number;
  /** (thisMonth - lastMonth) / lastMonth * 100, rounded. Null if no last month. */
  deltaPct: number | null;
  /** Top categories over the provided window, largest first (share 0..1). */
  categories: SpendCategory[];
  /** Spend per calendar month, oldest to newest, for the last 12 months. */
  monthly: Array<{ label: string; value: number }>;
};

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

/**
 * @param bills  the user's bill items (recent-first is fine; order ignored)
 * @param now    the reference instant ("this month" is now's calendar month)
 * @param topN   how many named categories before the rest fold into "Other"
 */
export function summarizeSpend(
  bills: BillItem[],
  now: Date,
  topN = 6,
): SpendSummary {
  const thisKey = monthKey(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
  );
  const lastKey = monthKey(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
  );

  // The trailing 12 calendar months (oldest to newest).
  const months: Array<{ key: string; label: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({
      key: monthKey(d),
      label: new Date(d).toLocaleDateString(undefined, {
        month: "short",
        timeZone: "UTC",
      }),
    });
  }
  const monthSet = new Set(months.map((m) => m.key));

  const monthTotals = new Map<string, number>();
  const catTotals = new Map<string, number>();
  let thisMonth = 0;
  let lastMonth = 0;
  let currency = "";
  let any = false;

  for (const b of bills) {
    if (typeof b.amount_normalized !== "number" || !Number.isFinite(b.amount_normalized)) continue;
    if (!b.occurred_at) continue;
    const amt = b.amount_normalized;
    const d = new Date(b.occurred_at);
    if (Number.isNaN(d.getTime())) continue;
    any = true;
    if (!currency && b.amount_currency) currency = b.amount_currency;
    const key = monthKey(d);
    if (key === thisKey) thisMonth += amt;
    if (key === lastKey) lastMonth += amt;
    if (monthSet.has(key)) monthTotals.set(key, (monthTotals.get(key) ?? 0) + amt);
    const cat = (b.category || "Other").trim() || "Other";
    catTotals.set(cat, (catTotals.get(cat) ?? 0) + amt);
  }

  const monthly = months.map((m) => ({
    label: m.label,
    value: Math.round(monthTotals.get(m.key) ?? 0),
  }));

  const sortedCats = [...catTotals.entries()].sort((a, b) => b[1] - a[1]);
  const grandTotal = sortedCats.reduce((s, [, v]) => s + v, 0);
  const top = sortedCats.slice(0, topN);
  const restTotal = sortedCats.slice(topN).reduce((s, [, v]) => s + v, 0);
  const categories: SpendCategory[] = top.map(([label, amount]) => ({
    label,
    amount: Math.round(amount),
    share: grandTotal > 0 ? amount / grandTotal : 0,
  }));
  if (restTotal > 0) {
    categories.push({
      label: "Other",
      amount: Math.round(restTotal),
      share: grandTotal > 0 ? restTotal / grandTotal : 0,
    });
  }

  const deltaPct =
    lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

  return {
    hasData: any,
    currency: currency || "USD",
    thisMonth: Math.round(thisMonth),
    lastMonth: Math.round(lastMonth),
    deltaPct,
    categories,
    monthly,
  };
}
