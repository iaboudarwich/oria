import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";

/**
 * Read layer for the unified Health surface (Round 17). health_metrics holds
 * one row per user per day per source (WHOOP today). Rows are the user's own;
 * RLS is SELECT-own, and we also filter by user_id explicitly. All times are
 * stored as UTC day keys (metric_date).
 */

export type HealthMetric = {
  metric_date: string;
  source: string;
  recovery_score: number | null;
  resting_heart_rate: number | null;
  hrv_milli: number | null;
  sleep_performance: number | null;
  sleep_total_minutes: number | null;
  sleep_efficiency: number | null;
  day_strain: number | null;
  day_kilojoule: number | null;
  avg_heart_rate: number | null;
  steps: number | null;
};

const COLUMNS =
  "metric_date, source, recovery_score, resting_heart_rate, hrv_milli, sleep_performance, sleep_total_minutes, sleep_efficiency, day_strain, day_kilojoule, avg_heart_rate, steps";

/** The user's daily health rows, newest first. Default window covers the last
 *  ~30 days; the panels slice their own 7-day view from it. */
export async function listHealthMetrics(
  opts: { sinceDate?: string; limit?: number } = {},
): Promise<HealthMetric[]> {
  const { sinceDate, limit = 60 } = opts;
  const ctx = await requireContext();
  const supabase = await createClient();
  let q = supabase
    .from("health_metrics")
    .select(COLUMNS)
    .eq("user_id", ctx.profile.id)
    .order("metric_date", { ascending: false })
    .limit(limit);
  if (sinceDate) q = q.gte("metric_date", sinceDate);
  const { data } = await q;
  return (data as HealthMetric[]) ?? [];
}

/** Most recent day that carries any signal. */
export function latestMetric(rows: HealthMetric[]): HealthMetric | null {
  return rows[0] ?? null;
}

/** Most recent row that has a non-null value for one field. */
export function latestWith(
  rows: HealthMetric[],
  field: keyof HealthMetric,
): HealthMetric | null {
  for (const r of rows) {
    if (r[field] !== null && r[field] !== undefined) return r;
  }
  return null;
}

/** 1 kcal = 4.184 kJ. WHOOP reports day energy expenditure in kilojoules. */
export function kjToKcal(kilojoule: number | null | undefined): number | null {
  if (kilojoule === null || kilojoule === undefined) return null;
  return Math.round(kilojoule / 4.184);
}

/** True when the user has any health data at all (so the Today card and the
 *  per-tab data views show, rather than a bare empty surface). */
export async function hasAnyHealthData(): Promise<boolean> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { count } = await supabase
    .from("health_metrics")
    .select("metric_date", { count: "exact", head: true })
    .eq("user_id", ctx.profile.id);
  return (count ?? 0) > 0;
}
