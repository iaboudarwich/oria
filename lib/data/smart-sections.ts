import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { enforceActiveOrg } from "./scope";
import type { MemoryItem } from "@/lib/supabase/types";

/**
 * Queryable shape of a Diet meal entry. Pulls only the columns the Diet
 * page actually renders — keeps the wire payload small.
 */
export type DietMeal = Pick<
  MemoryItem,
  | "id"
  | "upload_id"
  | "title"
  | "summary"
  | "occurred_at"
  | "calories"
  | "protein_g"
  | "carbs_g"
  | "fat_g"
  | "items_purchased"
  | "confidence"
  | "facts"
>;

/**
 * Queryable shape of a Bills entry.
 */
export type BillItem = Pick<
  MemoryItem,
  | "id"
  | "upload_id"
  | "title"
  | "summary"
  | "merchant"
  | "amount_value"
  | "amount_currency"
  | "amount_normalized"
  | "occurred_at"
  | "location"
  | "is_recurring"
  | "recurring_interval"
  | "category"
  | "confidence"
>;

const DIET_COLUMNS =
  "id, organization_id, upload_id, title, summary, occurred_at, calories, protein_g, carbs_g, fat_g, items_purchased, confidence, facts";

const BILL_COLUMNS =
  "id, organization_id, upload_id, title, summary, merchant, amount_value, amount_currency, amount_normalized, occurred_at, location, is_recurring, recurring_interval, category, confidence";

/**
 * Pull the user's Diet items in the active org. Default window is "today",
 * but callers can request a wider range for the weekly view.
 */
export async function listDietMeals(opts: {
  since?: Date;
  limit?: number;
} = {}): Promise<DietMeal[]> {
  const { since, limit = 200 } = opts;
  const ctx = await requireContext();
  const supabase = await createClient();

  let q = supabase
    .from("memory_items")
    .select(DIET_COLUMNS)
    .eq("organization_id", ctx.organization.id)
    .eq("smart_section", "diet")
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (since) q = q.gte("occurred_at", since.toISOString());

  const { data } = await q;
  type Row = DietMeal & { organization_id: string };
  return enforceActiveOrg(
    (data ?? []) as Row[],
    ctx.organization.id,
    "listDietMeals",
  ) as DietMeal[];
}

export type DietTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export function sumMacros(meals: DietMeal[]): DietTotals {
  return meals.reduce<DietTotals>(
    (acc, m) => ({
      calories: acc.calories + (m.calories ?? 0),
      protein_g: acc.protein_g + (m.protein_g ?? 0),
      carbs_g: acc.carbs_g + (m.carbs_g ?? 0),
      fat_g: acc.fat_g + (m.fat_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

/**
 * Pull all Bills items in the active org, newest first. The Bills page
 * partitions this list client-side into upcoming / recurring / recent.
 */
export async function listBills(limit = 200): Promise<BillItem[]> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("memory_items")
    .select(BILL_COLUMNS)
    .eq("organization_id", ctx.organization.id)
    .eq("smart_section", "bills")
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  type Row = BillItem & { organization_id: string };
  return enforceActiveOrg(
    (data ?? []) as Row[],
    ctx.organization.id,
    "listBills",
  ) as BillItem[];
}

/**
 * Aggregate recurring bills by merchant: cadence + average amount + last
 * seen + a best-effort "next expected" date. Used by the Bills page's
 * Recurring + Forecast sections.
 */
export type RecurringSummary = {
  merchant: string;
  interval: string | null;
  count: number;
  average: number | null;
  currency: string | null;
  last_seen: string | null;
  next_expected: string | null;
};

export function summarizeRecurring(bills: BillItem[]): RecurringSummary[] {
  const groups = new Map<string, BillItem[]>();
  for (const b of bills) {
    if (!b.is_recurring) continue;
    const key = (b.merchant ?? "").trim().toLowerCase();
    if (!key) continue;
    const arr = groups.get(key);
    if (arr) arr.push(b);
    else groups.set(key, [b]);
  }
  const out: RecurringSummary[] = [];
  for (const [, bs] of groups) {
    bs.sort((a, b) =>
      (b.occurred_at ?? "").localeCompare(a.occurred_at ?? ""),
    );
    const numeric = bs
      .map((b) => b.amount_normalized)
      .filter((n): n is number => typeof n === "number");
    const avg = numeric.length
      ? numeric.reduce((a, b) => a + b, 0) / numeric.length
      : null;
    const interval = bs.find((b) => b.recurring_interval)?.recurring_interval ?? null;
    const last = bs[0]?.occurred_at ?? null;
    out.push({
      merchant: bs[0].merchant ?? "",
      interval,
      count: bs.length,
      average: avg !== null ? Math.round(avg * 100) / 100 : null,
      currency:
        bs.find((b) => b.amount_currency)?.amount_currency ?? null,
      last_seen: last,
      next_expected: last ? nextOccurrence(last, interval) : null,
    });
  }
  // Most-recent-first.
  out.sort((a, b) => (b.last_seen ?? "").localeCompare(a.last_seen ?? ""));
  return out;
}

function nextOccurrence(lastIso: string, interval: string | null): string | null {
  const d = new Date(lastIso);
  if (Number.isNaN(d.getTime())) return null;
  switch ((interval ?? "").toLowerCase()) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      // Unknown cadence — default to monthly which covers most household bills.
      d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString();
}
