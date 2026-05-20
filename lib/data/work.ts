import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { DocumentType, MemoryItem } from "@/lib/supabase/types";

/**
 * Scope every Work query to the active org. We don't filter by smart_section
 * here — the Diet smart routing only applies to personal mode; in a Work
 * space anything financial counts as a Finance/Bills/Invoice item.
 */

const FEED_COLUMNS =
  "id, upload_id, title, summary, document_type, merchant, amount_value, amount_currency, amount_normalized, occurred_at, location, category, direction, is_recurring, recurring_interval, confidence, created_at";

export type WorkFeedItem = Pick<
  MemoryItem,
  | "id"
  | "upload_id"
  | "title"
  | "summary"
  | "document_type"
  | "merchant"
  | "amount_value"
  | "amount_currency"
  | "amount_normalized"
  | "occurred_at"
  | "location"
  | "category"
  | "direction"
  | "is_recurring"
  | "recurring_interval"
  | "confidence"
  | "created_at"
>;

type ListOpts = { limit?: number };

/** Finance feed: invoices + receipts + statement-derived items. */
export async function listWorkFinance(opts: ListOpts = {}): Promise<WorkFeedItem[]> {
  const { limit = 100 } = opts;
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("memory_items")
    .select(FEED_COLUMNS)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .in("document_type", ["invoice", "receipt", "scanned_document"])
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as WorkFeedItem[];
}

/** Contracts feed: agreements, NDAs, leases, term sheets. */
export async function listWorkContracts(opts: ListOpts = {}): Promise<WorkFeedItem[]> {
  const { limit = 100 } = opts;
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("memory_items")
    .select(FEED_COLUMNS)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .eq("document_type", "contract")
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as WorkFeedItem[];
}

/** Invoices feed. */
export async function listWorkInvoices(opts: ListOpts = {}): Promise<WorkFeedItem[]> {
  const { limit = 100 } = opts;
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("memory_items")
    .select(FEED_COLUMNS)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .eq("document_type", "invoice")
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as WorkFeedItem[];
}

/* ----- Analysis aggregates ---------------------------------------------- */

export type MonthBucket = {
  key: string; // "2025-04"
  label: string; // "Apr"
  inflow: number;
  outflow: number;
};

export type AnalysisAggregates = {
  /** Months sorted oldest to newest, exactly window length. Empty months
   *  still appear so the chart renders a continuous timeline. */
  months: MonthBucket[];
  /** Top spending merchants over the window, with normalised total. */
  topMerchants: Array<{ merchant: string; total: number; currency: string | null }>;
  /** Items that look unusually large vs the per-merchant rolling average. */
  anomalies: Array<{
    id: string;
    title: string;
    merchant: string | null;
    amount: number;
    avg: number;
    multiple: number;
    occurred_at: string;
    upload_id: string | null;
  }>;
  totals: {
    inflow: number;
    outflow: number;
    transactions: number;
    currency: string | null;
  };
  /** True when we have any financial items at all — drives the empty state. */
  hasData: boolean;
};

const ANOMALY_MULTIPLE = 2;
const ANOMALY_MIN_HISTORY = 3;

/**
 * Pull the last `windowMonths` months of financial items and compute the
 * shape the Analysis page renders. Everything runs in one query then we
 * aggregate in memory — for typical orgs (<10k items) this is fine.
 */
export async function computeAnalysis(
  windowMonths = 6,
): Promise<AnalysisAggregates> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (windowMonths - 1), 1);

  type Row = {
    id: string;
    upload_id: string | null;
    title: string;
    merchant: string | null;
    amount_normalized: number | null;
    amount_currency: string | null;
    occurred_at: string | null;
    direction: "inflow" | "outflow" | null;
    document_type: DocumentType | null;
  };

  const { data } = await supabase
    .from("memory_items")
    .select(
      "id, upload_id, title, merchant, amount_normalized, amount_currency, occurred_at, direction, document_type",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .gte("occurred_at", start.toISOString())
    .order("occurred_at", { ascending: true });

  const rows = (data ?? []) as Row[];

  // Build the month skeleton.
  const months: MonthBucket[] = [];
  for (let i = 0; i < windowMonths; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    months.push({
      key: monthKey(d),
      label: d.toLocaleDateString(undefined, { month: "short" }),
      inflow: 0,
      outflow: 0,
    });
  }
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));

  const merchantTotals = new Map<
    string,
    { total: number; currency: string | null }
  >();
  const merchantHistory = new Map<string, number[]>();
  const currencyCount = new Map<string, number>();

  let totalIn = 0;
  let totalOut = 0;
  let txCount = 0;
  let anomaliesRaw: Array<{
    id: string;
    title: string;
    merchant: string | null;
    amount: number;
    avg: number;
    multiple: number;
    occurred_at: string;
    upload_id: string | null;
  }> = [];

  // First pass: fill months + merchant totals + history.
  for (const r of rows) {
    if (!r.occurred_at) continue;
    const amt = r.amount_normalized ?? 0;
    if (amt === 0) continue;
    const direction = inferDirection(r);
    if (!direction) continue;

    const d = new Date(r.occurred_at);
    const idx = monthIndex.get(monthKey(d));
    if (idx !== undefined) {
      if (direction === "outflow") months[idx].outflow += amt;
      else months[idx].inflow += amt;
    }
    if (direction === "outflow") totalOut += amt;
    else totalIn += amt;
    txCount++;

    if (r.amount_currency) {
      currencyCount.set(
        r.amount_currency,
        (currencyCount.get(r.amount_currency) ?? 0) + 1,
      );
    }

    if (r.merchant) {
      const key = r.merchant.toLowerCase();
      const cur = merchantTotals.get(key) ?? { total: 0, currency: null };
      cur.total += amt;
      cur.currency = cur.currency ?? r.amount_currency;
      merchantTotals.set(key, cur);
      const hist = merchantHistory.get(key) ?? [];
      hist.push(amt);
      merchantHistory.set(key, hist);
    }
  }

  // Second pass: flag anomalies. An item is anomalous when it's ≥2x the
  // merchant's rolling average AND the merchant has at least 3 prior items
  // (so we don't flag every first-time entry).
  for (const r of rows) {
    if (!r.merchant || !r.occurred_at) continue;
    const amt = r.amount_normalized ?? 0;
    if (amt === 0) continue;
    const hist = merchantHistory.get(r.merchant.toLowerCase()) ?? [];
    if (hist.length < ANOMALY_MIN_HISTORY) continue;
    const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
    if (avg === 0) continue;
    const multiple = amt / avg;
    if (multiple < ANOMALY_MULTIPLE) continue;
    anomaliesRaw.push({
      id: r.id,
      title: r.title,
      merchant: r.merchant,
      amount: amt,
      avg,
      multiple,
      occurred_at: r.occurred_at,
      upload_id: r.upload_id,
    });
  }
  // Most-extreme first; cap to 5.
  anomaliesRaw.sort((a, b) => b.multiple - a.multiple);
  anomaliesRaw = anomaliesRaw.slice(0, 5);

  // Top spending merchants by outflow + neutral total.
  const topMerchants = Array.from(merchantTotals.entries())
    .map(([key, v]) => {
      // Recover the original casing from the first row that matched.
      const original =
        rows.find((r) => (r.merchant ?? "").toLowerCase() === key)?.merchant ??
        key;
      return { merchant: original, total: v.total, currency: v.currency };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const dominantCurrency =
    Array.from(currencyCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    null;

  return {
    months,
    topMerchants,
    anomalies: anomaliesRaw,
    totals: {
      inflow: Math.round(totalIn * 100) / 100,
      outflow: Math.round(totalOut * 100) / 100,
      transactions: txCount,
      currency: dominantCurrency,
    },
    hasData: txCount > 0,
  };
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Best-effort direction when the model didn't set one explicitly. Receipts +
 * invoices the user uploaded are *usually* outflows in a Personal/Work
 * setting, but if direction is set we always honour it.
 */
function inferDirection(r: {
  direction: "inflow" | "outflow" | null;
  document_type: DocumentType | null;
}): "inflow" | "outflow" | null {
  if (r.direction) return r.direction;
  if (
    r.document_type === "receipt" ||
    r.document_type === "invoice"
  ) {
    return "outflow";
  }
  return null;
}
