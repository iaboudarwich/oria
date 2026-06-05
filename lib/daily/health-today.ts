import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { kjToKcal } from "@/lib/data/health-data";
import { sameDayInTz } from "@/lib/utils/tz";

/**
 * The one Health stat surfaced on Today (Round 17, Part 3): the latest recovery
 * (or sleep, if recovery is absent) plus today's calorie balance when both
 * sides exist. Returns null when the user has NO health data at all, so the
 * Today card only appears for people with WHOOP and/or meal logs. Runs through
 * the admin client (no request scope on the home loaders), keyed by user_id.
 */

export type HealthToday = {
  recoveryPct: number | null;
  sleepPct: number | null;
  intakeKcal: number | null;
  burnKcal: number | null;
};

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function loadHealthToday(
  userId: string,
  organizationId: string,
  tz: string | null,
  now: Date,
): Promise<HealthToday | null> {
  const admin = createAdminClient();
  const zone = tz && tz !== "" ? tz : "UTC";

  const [metricsRes, dietRes] = await Promise.all([
    admin
      .from("health_metrics")
      .select("metric_date, recovery_score, sleep_performance, day_kilojoule")
      .eq("user_id", userId)
      .order("metric_date", { ascending: false })
      .limit(7),
    admin
      .from("memory_items")
      .select("calories, occurred_at")
      .eq("organization_id", organizationId)
      .eq("smart_section", "diet")
      .is("deleted_at", null)
      .gte("occurred_at", new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const metrics = (metricsRes.data ?? []) as Array<{
    metric_date: string;
    recovery_score: number | null;
    sleep_performance: number | null;
    day_kilojoule: number | null;
  }>;

  const recoveryPct = metrics.find((m) => m.recovery_score !== null)?.recovery_score ?? null;
  const sleepPct = metrics.find((m) => m.sleep_performance !== null)?.sleep_performance ?? null;
  const todayKey = utcDayKey(now);
  const todayRow = metrics.find((m) => m.metric_date === todayKey);
  const burnKcal = todayRow ? kjToKcal(todayRow.day_kilojoule) : null;

  const meals = (dietRes.data ?? []) as Array<{ calories: number | null; occurred_at: string | null }>;
  const todayMeals = meals.filter((m) =>
    m.occurred_at ? sameDayInTz(new Date(m.occurred_at), now, zone) : false,
  );
  const intakeKcal =
    todayMeals.length > 0
      ? Math.round(todayMeals.reduce((acc, m) => acc + (m.calories ?? 0), 0))
      : null;

  // Show the card only when it has something real to lead with: a recovery or
  // sleep stat, or a full calorie balance (both sides present). Meals alone are
  // covered by the Diet tab and don't warrant a Today health card.
  const hasHero = recoveryPct !== null || sleepPct !== null;
  const hasBalance = intakeKcal !== null && burnKcal !== null;
  if (!hasHero && !hasBalance) return null;

  return { recoveryPct, sleepPct, intakeKcal, burnKcal };
}
