/**
 * Net worth math. Pure and tested so the number on the page and the number the
 * cron snapshots can never drift.
 *
 * Holdings are entered in whatever currency the user holds them in. We do NOT
 * invent exchange rates (that would be a fabricated number, principle "correct
 * at write time"), so net worth is computed per currency and the page leads
 * with the PRIMARY currency (the one holding the most total value). Other
 * currencies are surfaced as a plain count, never silently summed together.
 */

export type ManualAssetKind =
  | "cash"
  | "crypto"
  | "investment"
  | "property"
  | "vehicle"
  | "other"
  | "debt";

/** The one kind that counts against net worth rather than toward it. */
export const LIABILITY_KINDS: ReadonlySet<ManualAssetKind> = new Set(["debt"]);

export const ASSET_KINDS: ManualAssetKind[] = [
  "cash",
  "crypto",
  "investment",
  "property",
  "vehicle",
  "other",
  "debt",
];

export type AssetInput = {
  kind: ManualAssetKind;
  amount: number;
  currency: string | null;
  exclude_from_insights?: boolean | null;
};

export type NetWorth = {
  /** Currency the headline figures are expressed in. */
  currency: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  /** Positive value held by asset kind (liabilities excluded), for the donut. */
  byKind: Partial<Record<ManualAssetKind, number>>;
  /** Other currencies present that are not folded into the headline. */
  otherCurrencies: string[];
};

function normCurrency(c: string | null | undefined): string {
  const v = (c ?? "USD").trim().toUpperCase();
  return v || "USD";
}

/**
 * Compute net worth for a set of holdings. Excludes any holding flagged
 * exclude_from_insights. Picks the primary currency by total absolute value,
 * computes the rollup for that currency, and lists the rest.
 */
export function computeNetWorth(assets: AssetInput[]): NetWorth {
  const live = assets.filter((a) => !a.exclude_from_insights && Number.isFinite(a.amount));

  // Total absolute value per currency to pick the primary one.
  const weight = new Map<string, number>();
  for (const a of live) {
    const c = normCurrency(a.currency);
    weight.set(c, (weight.get(c) ?? 0) + Math.abs(a.amount));
  }
  const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1]);
  const currency = ranked[0]?.[0] ?? "USD";
  const otherCurrencies = ranked.slice(1).map(([c]) => c);

  let totalAssets = 0;
  let totalLiabilities = 0;
  const byKind: Partial<Record<ManualAssetKind, number>> = {};
  for (const a of live) {
    if (normCurrency(a.currency) !== currency) continue;
    const amt = Math.abs(a.amount);
    if (LIABILITY_KINDS.has(a.kind)) {
      totalLiabilities += amt;
    } else {
      totalAssets += amt;
      byKind[a.kind] = (byKind[a.kind] ?? 0) + amt;
    }
  }

  return {
    currency,
    totalAssets: round2(totalAssets),
    totalLiabilities: round2(totalLiabilities),
    netWorth: round2(totalAssets - totalLiabilities),
    byKind,
    otherCurrencies,
  };
}

/** Allocation slices for the donut: one per asset kind that holds value. */
export type AllocationSlice = { kind: ManualAssetKind; value: number; share: number };

export function allocationSlices(nw: NetWorth): AllocationSlice[] {
  const entries = Object.entries(nw.byKind) as [ManualAssetKind, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return [];
  return entries
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, value]) => ({ kind, value: round2(value), share: value / total }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
