import { getTranslations } from "next-intl/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { HeroNumber } from "@/components/ui/hero-number";
import { HealthBars } from "./health-bars";
import { WhoopCta } from "./whoop-cta";
import { CalorieBalanceCard } from "./calorie-balance-card";
import { buildWeekSeries } from "@/lib/health/compute";
import { latestWith, type HealthMetric } from "@/lib/data/health-data";

/** Body: the overview tab. Recovery is the headline; resting heart rate and
 *  heart-rate variability sit beneath, with today's calorie balance and a
 *  7-day recovery trend. Falls back to the connect prompt with no WHOOP data. */
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

  const bars = buildWeekSeries(metrics, "recovery_score", now);

  return (
    <div className="space-y-5">
      <CalorieBalanceCard intakeKcal={intakeKcal} burnKcal={burnKcal} />

      <div className="rounded-2xl border border-line bg-surface-raised p-4">
        <Eyebrow>{t("recovery")}</Eyebrow>
        <HeroNumber className="mt-1" value={rec ? `${rec.recovery_score}%` : "·"} />
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[13px] text-ink-muted tabular-nums">
          {rhr ? (
            <span>
              {t("resting_hr")}{" "}
              <span className="text-ink">
                {rhr.resting_heart_rate} {t("bpm")}
              </span>
            </span>
          ) : null}
          {hrv ? (
            <span>
              {t("hrv")} <span className="text-ink">{Math.round(hrv.hrv_milli!)} ms</span>
            </span>
          ) : null}
        </div>
      </div>

      {bars.some((b) => b.value > 0) ? (
        <HealthBars bars={bars} caption={t("recovery_caption")} />
      ) : null}
    </div>
  );
}
