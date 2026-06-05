import { getTranslations } from "next-intl/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { HeroNumber } from "@/components/ui/hero-number";
import { HealthBars } from "./health-bars";
import { WhoopCta } from "./whoop-cta";
import { buildWeekSeries } from "@/lib/health/compute";
import { latestWith, kjToKcal, type HealthMetric } from "@/lib/data/health-data";

/** Movement: day strain is the headline, with active energy and steps beside
 *  it, and a 7-day strain trend. Steps show only when a source provides them
 *  (WHOOP's public data does not always include a step count). */
export async function MovementPanel({
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
  const strain = latestWith(metrics, "day_strain");
  const energy = latestWith(metrics, "day_kilojoule");
  const steps = latestWith(metrics, "steps");
  const hasData = !!(strain || energy || steps);

  if (!hasData) {
    return (
      <WhoopCta
        body={t("movement_empty")}
        acknowledged={acknowledged}
        whoopConnected={whoopConnected}
      />
    );
  }

  const bars = buildWeekSeries(metrics, "day_strain", now);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-surface-raised p-4">
        <Eyebrow>{t("day_strain")}</Eyebrow>
        <HeroNumber className="mt-1" value={strain ? strain.day_strain!.toFixed(1) : "·"} />
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[13px] text-ink-muted tabular-nums">
          {energy ? (
            <span>
              {t("active_energy")}{" "}
              <span className="text-ink">
                {kjToKcal(energy.day_kilojoule)!.toLocaleString()} {t("kcal")}
              </span>
            </span>
          ) : null}
          {steps ? (
            <span>
              {t("steps")} <span className="text-ink">{steps.steps!.toLocaleString()}</span>
            </span>
          ) : null}
        </div>
      </div>

      {bars.some((b) => b.value > 0) ? (
        <HealthBars bars={bars} caption={t("strain_caption")} />
      ) : null}
    </div>
  );
}
