import { getTranslations } from "next-intl/server";
import { WhoopCta } from "./whoop-cta";
import { MetricDial, type Contributor } from "./metric-dial";
import {
  buildWeekSeries,
  buildMonthSeries,
  formatSleepDuration,
  scoreState,
} from "@/lib/health/compute";
import { latestWith, type HealthMetric } from "@/lib/data/health-data";
import { DATA_VAR, DATA_TRACK } from "@/lib/ui/status-color";

/** Sleep: last night's performance is the headline dial (semantic indigo), with
 *  hours asleep + efficiency as tap-through contributors and a 1-week / 1-month
 *  performance trend. */
export async function SleepPanel({
  metrics,
  whoopConnected,
  acknowledged,
  now,
}: {
  metrics: HealthMetric[];
  whoopConnected: boolean;
  acknowledged: boolean;
  now: Date;
}) {
  const t = await getTranslations("health");
  const perf = latestWith(metrics, "sleep_performance");
  const dur = latestWith(metrics, "sleep_total_minutes");
  const eff = latestWith(metrics, "sleep_efficiency");
  const hasData = !!(perf || dur);

  if (!hasData) {
    return (
      <WhoopCta
        body={t("sleep_empty")}
        acknowledged={acknowledged}
        whoopConnected={whoopConnected}
      />
    );
  }

  const score = perf?.sleep_performance ?? null;
  const hours = formatSleepDuration(dur?.sleep_total_minutes ?? null);
  const contributors: Contributor[] = [];
  if (hours) contributors.push({ label: t("last_night"), value: hours });
  if (eff?.sleep_efficiency != null)
    contributors.push({ label: t("sleep_efficiency"), value: `${eff.sleep_efficiency}%` });

  const week = buildWeekSeries(metrics, "sleep_performance", now);
  const month = buildMonthSeries(metrics, "sleep_performance", now);

  return (
    <MetricDial
      title={t("sleep_performance")}
      // No performance score (only a duration) leaves the ring empty but still
      // shows the real hours in the center; never a fabricated percent.
      arcScore={score ?? 0}
      displayValue={score != null ? `${score}` : hours ?? "·"}
      unit={score != null ? "%" : undefined}
      colorVar={DATA_VAR.sleep}
      trackVar={DATA_TRACK.sleep}
      state={score != null ? t(`state_${scoreState(score)}` as "state_primed") : undefined}
      contributors={contributors}
      contributorsLabel={t("contributors")}
      contributorsHint={t("contributors_hint")}
      week={week}
      month={month}
      weekLabel={t("lens_week")}
      monthLabel={t("lens_month")}
      trendCaption={t("sleep_caption")}
    />
  );
}
