import { getTranslations } from "next-intl/server";
import { WhoopCta } from "./whoop-cta";
import { CalorieBalanceCard } from "./calorie-balance-card";
import { MetricDial, type Contributor } from "./metric-dial";
import { buildWeekSeries, buildMonthSeries, scoreState } from "@/lib/health/compute";
import { latestWith, type HealthMetric } from "@/lib/data/health-data";
import { DATA_VAR, DATA_TRACK } from "@/lib/ui/status-color";

/** Body: the overview tab. Recovery is the headline dial (semantic green), with
 *  resting heart rate + HRV as tap-through contributors, today's calorie
 *  balance, and a 1-week / 1-month recovery trend. Falls back to the connect
 *  prompt with no WHOOP data. */
export async function BodyPanel({
  metrics,
  whoopConnected,
  acknowledged,
  intakeKcal,
  burnKcal,
  now,
}: {
  metrics: HealthMetric[];
  whoopConnected: boolean;
  acknowledged: boolean;
  intakeKcal: number | null;
  burnKcal: number | null;
  now: Date;
}) {
  const t = await getTranslations("health");
  const rec = latestWith(metrics, "recovery_score");
  const rhr = latestWith(metrics, "resting_heart_rate");
  const hrv = latestWith(metrics, "hrv_milli");
  const hasData = !!(rec || rhr || hrv);

  if (!hasData) {
    return (
      <div className="space-y-5">
        <CalorieBalanceCard intakeKcal={intakeKcal} burnKcal={burnKcal} />
        <WhoopCta body={t("body_empty")} acknowledged={acknowledged} whoopConnected={whoopConnected} />
      </div>
    );
  }

  const score = rec?.recovery_score ?? null;
  const contributors: Contributor[] = [];
  if (rhr) contributors.push({ label: t("resting_hr"), value: `${rhr.resting_heart_rate} ${t("bpm")}` });
  if (hrv) contributors.push({ label: t("hrv"), value: `${Math.round(hrv.hrv_milli!)} ms` });

  return (
    <div className="space-y-5">
      <CalorieBalanceCard intakeKcal={intakeKcal} burnKcal={burnKcal} />

      {score != null ? (
        <MetricDial
          title={t("recovery")}
          arcScore={score}
          displayValue={`${score}`}
          unit="%"
          colorVar={DATA_VAR.recovery}
          trackVar={DATA_TRACK.recovery}
          state={t(`state_${scoreState(score)}` as "state_primed")}
          contributors={contributors}
          contributorsLabel={t("contributors")}
          contributorsHint={t("contributors_hint")}
          week={buildWeekSeries(metrics, "recovery_score", now)}
          month={buildMonthSeries(metrics, "recovery_score", now)}
          weekLabel={t("lens_week")}
          monthLabel={t("lens_month")}
          trendCaption={t("recovery_caption")}
        />
      ) : null}
    </div>
  );
}
