import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { DocumentType } from "@/lib/supabase/types";

/**
 * Proactive insights for the active space. Cheap heuristics, no ML.
 * Every detector is best-effort: on error we return an empty array
 * rather than break the surface that renders us.
 *
 * Strict scoping: everything filters by organization_id. A Workspace
 * never surfaces Personal data and vice versa. Insights are computed
 * fresh per render, there's no separate `insights` table, so they
 * always reflect the current state.
 *
 * The card on the home page renders at most a handful of these. We
 * cap the output ourselves so a noisy week of uploads can't fill the
 * surface.
 */

export type InsightKind =
  | "spending.delta"
  | "lease.expiring"
  | "contract.expiring"
  | "diet.protein"
  | "diet.calories"
  | "recurring.overdue"
  | "vendor.anomaly";

export type Insight = {
  /** Stable id so the user can dismiss this exact observation. The
   *  id is content-hashed (kind + key facts), two identical weeks
   *  produce the same id, so dismissing once silences the same fact. */
  id: string;
  kind: InsightKind;
  /** One-line, calm, user-facing copy. No emoji, no exclamation. */
  message: string;
  /** Optional in-app link the user can follow for more detail. */
  href: string | null;
};

const MAX_INSIGHTS = 4;

export async function computeUserInsights(): Promise<Insight[]> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const orgId = ctx.organization.id;
  const isWork = ctx.organization.kind === "office";

  const [spending, leases, diet, recurring] = await Promise.all([
    detectSpendingDelta(supabase, orgId).catch(() => null),
    detectExpiringDocs(supabase, orgId).catch(() => []),
    isWork
      ? Promise.resolve(null)
      : detectDietTrend(supabase, orgId).catch(() => null),
    detectOverdueRecurring(supabase, orgId).catch(() => null),
  ]);

  const out: Insight[] = [];
  if (spending) out.push(spending);
  for (const l of leases) out.push(l);
  if (diet) out.push(diet);
  if (recurring) out.push(recurring);

  return out.slice(0, MAX_INSIGHTS);
}

/* ---------- Detectors ----------------------------------------------------- */

type SBClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Month-over-month outflow comparison, top-line. Compares the last 30
 * days of spending to the prior 30 days (active org, outflow only).
 * Only flags when there's enough signal on both sides AND the delta
 * is at least 15%.
 */
async function detectSpendingDelta(
  supabase: SBClient,
  orgId: string,
): Promise<Insight | null> {
  const now = Date.now();
  const since60ISO = new Date(now - 60 * 24 * 3600 * 1000).toISOString();
  const split = now - 30 * 24 * 3600 * 1000;

  const { data } = await supabase
    .from("memory_items")
    .select("amount_normalized, occurred_at, direction, amount_currency")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .gte("occurred_at", since60ISO)
    .not("amount_normalized", "is", null)
    .limit(800);

  type Row = {
    amount_normalized: number | null;
    occurred_at: string;
    direction: "inflow" | "outflow" | null;
    amount_currency: string | null;
  };
  let recent = 0;
  let prior = 0;
  let count = 0;
  let currency: string | null = null;
  for (const r of (data ?? []) as Row[]) {
    if (r.amount_normalized === null) continue;
    if (r.direction === "inflow") continue;
    const t = new Date(r.occurred_at).getTime();
    if (Number.isNaN(t)) continue;
    if (currency === null && r.amount_currency) currency = r.amount_currency;
    if (t >= split) recent += r.amount_normalized;
    else prior += r.amount_normalized;
    count += 1;
  }
  // Need real signal on both sides, guard against the "first month of
  // uploads ever" case which would otherwise read as a 999% spike.
  if (count < 6 || prior <= 0 || recent <= 0) return null;
  const delta = (recent - prior) / prior;
  if (Math.abs(delta) < 0.15) return null;

  const pct = Math.round(Math.abs(delta) * 100);
  const direction = delta > 0 ? "up" : "down";
  const word = direction === "up" ? "increased" : "decreased";
  return {
    id: `spending-${direction}-${pct}`,
    kind: "spending.delta",
    message: `Spending ${word} ${pct}% vs the previous 30 days${
      currency ? ` (${currency})` : ""
    }.`,
    href: "/dashboard/work/analysis",
  };
}

/**
 * Leases and contracts whose extracted occurred_at (treated as expiry
 * for these document types, see lib/ai/extract.ts) falls in the next
 * 30 days. One insight per row, capped at two.
 */
async function detectExpiringDocs(
  supabase: SBClient,
  orgId: string,
): Promise<Insight[]> {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  // DocumentType only has "contract", leases come through with that
  // type too. We use the title to label which is which so the user
  // sees "Lease for X expires…" when the title clearly says lease.
  const { data } = await supabase
    .from("memory_items")
    .select("id, upload_id, title, document_type, merchant, occurred_at")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .eq("document_type", "contract")
    .gte("occurred_at", now.toISOString())
    .lte("occurred_at", in30.toISOString())
    .order("occurred_at", { ascending: true })
    .limit(2);

  type Row = {
    id: string;
    upload_id: string | null;
    title: string;
    document_type: DocumentType;
    merchant: string | null;
    occurred_at: string;
  };
  const out: Insight[] = [];
  for (const r of (data ?? []) as Row[]) {
    const days = Math.max(
      0,
      Math.round(
        (new Date(r.occurred_at).getTime() - Date.now()) / (24 * 3600 * 1000),
      ),
    );
    const isLease = /\blease\b|\brental\b|\btenant\b/i.test(r.title);
    const noun = isLease ? "Lease" : "Contract";
    const subject = r.merchant || r.title || noun;
    const when =
      days === 0 ? "today" : days === 1 ? "in 1 day" : `in ${days} days`;
    out.push({
      id: `expiring-${r.id}`,
      kind: isLease ? "lease.expiring" : "contract.expiring",
      message: `${noun} for ${subject} expires ${when}.`,
      href: r.upload_id ? `/dashboard/uploads/${r.upload_id}` : "/dashboard/calendar",
    });
  }
  return out;
}

/**
 * Diet protein delta: this rolling week vs the prior week. Skipped in
 * Workspaces because Diet is a personal-mode concept (smart routing
 * never tags Diet items inside an office org).
 */
async function detectDietTrend(
  supabase: SBClient,
  orgId: string,
): Promise<Insight | null> {
  const now = Date.now();
  const since14ISO = new Date(now - 14 * 24 * 3600 * 1000).toISOString();
  const split = now - 7 * 24 * 3600 * 1000;
  const { data } = await supabase
    .from("memory_items")
    .select("protein_g, calories, occurred_at, smart_section")
    .eq("organization_id", orgId)
    .eq("smart_section", "diet")
    .is("deleted_at", null)
    .gte("occurred_at", since14ISO)
    .limit(400);

  type Row = {
    protein_g: number | null;
    calories: number | null;
    occurred_at: string;
  };
  let recent = 0;
  let prior = 0;
  let recentCount = 0;
  let priorCount = 0;
  for (const r of (data ?? []) as Row[]) {
    if (r.protein_g === null) continue;
    const t = new Date(r.occurred_at).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= split) {
      recent += r.protein_g;
      recentCount += 1;
    } else {
      prior += r.protein_g;
      priorCount += 1;
    }
  }
  if (recentCount < 3 || priorCount < 3) return null;
  if (prior <= 0) return null;
  const delta = (recent - prior) / prior;
  if (Math.abs(delta) < 0.15) return null;
  const word = delta > 0 ? "higher" : "lower";
  const pct = Math.round(Math.abs(delta) * 100);
  return {
    id: `diet-protein-${delta > 0 ? "up" : "down"}-${pct}`,
    kind: "diet.protein",
    message: `Protein intake is ${pct}% ${word} this week than last.`,
    href: "/dashboard/diet",
  };
}

/**
 * Recurring items whose last occurrence is past the expected cadence.
 * We surface only the worst-overdue one so the strip stays calm.
 */
async function detectOverdueRecurring(
  supabase: SBClient,
  orgId: string,
): Promise<Insight | null> {
  const since180ISO = new Date(
    Date.now() - 180 * 24 * 3600 * 1000,
  ).toISOString();
  const { data } = await supabase
    .from("memory_items")
    .select(
      "merchant, occurred_at, recurring_interval, upload_id, document_type",
    )
    .eq("organization_id", orgId)
    .eq("is_recurring", true)
    .is("deleted_at", null)
    .gte("occurred_at", since180ISO)
    .order("occurred_at", { ascending: false })
    .limit(400);

  type Row = {
    merchant: string | null;
    occurred_at: string;
    recurring_interval: string | null;
    upload_id: string | null;
    document_type: DocumentType | null;
  };

  // Group by merchant, find the latest occurrence per merchant + an
  // assumed interval (monthly when unspecified).
  type Bucket = {
    merchant: string;
    last: number;
    intervalDays: number;
    upload_id: string | null;
  };
  const byMerchant = new Map<string, Bucket>();
  for (const r of (data ?? []) as Row[]) {
    if (!r.merchant) continue;
    const t = new Date(r.occurred_at).getTime();
    if (Number.isNaN(t)) continue;
    const key = r.merchant.toLowerCase();
    const intervalDays = intervalToDays(r.recurring_interval);
    const existing = byMerchant.get(key);
    if (!existing || t > existing.last) {
      byMerchant.set(key, {
        merchant: r.merchant,
        last: t,
        intervalDays,
        upload_id: r.upload_id,
      });
    }
  }

  let worst: { merchant: string; overdueDays: number; upload_id: string | null } | null =
    null;
  const now = Date.now();
  for (const b of byMerchant.values()) {
    const expectedNext = b.last + b.intervalDays * 24 * 3600 * 1000;
    // Grace period of 3 days, networks of small monthly bills are
    // often 1–2 days off from their nominal cadence.
    const overdueMs = now - (expectedNext + 3 * 24 * 3600 * 1000);
    if (overdueMs <= 0) continue;
    const overdueDays = Math.round(overdueMs / (24 * 3600 * 1000));
    if (overdueDays < 1) continue;
    if (!worst || overdueDays > worst.overdueDays) {
      worst = { merchant: b.merchant, overdueDays, upload_id: b.upload_id };
    }
  }
  if (!worst) return null;
  return {
    id: `recurring-overdue-${worst.merchant.toLowerCase()}-${worst.overdueDays}`,
    kind: "recurring.overdue",
    message: `${worst.merchant} usually arrives by now, last one was ${
      worst.overdueDays
    } day${worst.overdueDays === 1 ? "" : "s"} ago.`,
    href: worst.upload_id
      ? `/dashboard/uploads/${worst.upload_id}`
      : "/dashboard/calendar",
  };
}

function intervalToDays(raw: string | null): number {
  const v = (raw ?? "").toLowerCase();
  if (v === "weekly") return 7;
  if (v === "monthly") return 30;
  if (v === "quarterly") return 90;
  if (v === "yearly") return 365;
  return 30; // sensible default for "unknown but is_recurring"
}
