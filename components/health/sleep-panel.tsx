import { getTranslations } from "next-intl/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { HeroNumber } from "@/components/ui/hero-number";
import { HealthBars } from "./health-bars";
import { WhoopCta } from "./whoop-cta";
import { buildWeekSeries, formatSleepDuration } from "@/lib/health/compute";
import { latestWith, type HealthMetric } from "@/lib/data/health-data";

/** Sleep: last night's performance is the headline, with hours asleep, and a
 *  7-day performance trend. */
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

  const bars = buildWeekSeries(metrics, "sleep_performance", now);
  const hours = formatSleepDuration(dur?.sleep_total_minutes ?? null);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-surface-raised p-4">
        <Eyebrow>{t("last_night")}</Eyebrow>
        <HeroNumber
          className="mt-1"
          value={perf ? `${perf.sleep_performance}%` : hours ?? "·"}
          label={perf ? t("sleep_performance") : undefined}
        />
        {hours && perf ? (
          <p className="mt-3 text-[13px] text-ink-muted tabular-nums">{hours}</p>
        ) : null}
      </div>

      {bars.some((b) => b.value > 0) ? (
        <HealthBars bars={bars} caption={t("sleep_caption")} />
      ) : null}
    </div>
  );
}
