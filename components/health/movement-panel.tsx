import { getTranslations } from "next-intl/server";
import { WhoopCta } from "./whoop-cta";
import { MetricDial, type Contributor } from "./metric-dial";
import { buildWeekSeries, buildMonthSeries } from "@/lib/health/compute";
import { latestWith, kjToKcal, type HealthMetric } from "@/lib/data/health-data";
import { DATA_VAR, DATA_TRACK } from "@/lib/ui/status-color";

// WHOOP day strain runs 0 to 21, so the ring fills against that scale while the
// center shows the real figure (e.g. 14.2). Not a percent; never invented.
const STRAIN_MAX = 21;

/** Movement: day strain is the headline dial (semantic cyan), with active
 *  energy + steps as tap-through contributors and a 1-week / 1-month strain
 *  trend. Steps show only when a source provides them. */
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

  const value = strain?.day_strain ?? null;
  const contributors: Contributor[] = [];
  if (energy) {
    contributors.push({
      label: t("active_energy"),
      value: `${kjToKcal(energy.day_kilojoule)!.toLocaleString()} ${t("kcal")}`,
    });
  }
  if (steps) contributors.push({ label: t("steps"), value: steps.steps!.toLocaleString() });

  return (
    <MetricDial
      title={t("day_strain")}
      arcScore={value != null ? Math.min(100, (value / STRAIN_MAX) * 100) : 0}
      displayValue={value != null ? value.toFixed(1) : "·"}
      colorVar={DATA_VAR.strain}
      trackVar={DATA_TRACK.strain}
      contributors={contributors}
      contributorsLabel={t("contributors")}
      contributorsHint={t("contributors_hint")}
      week={buildWeekSeries(metrics, "day_strain", now)}
      month={buildMonthSeries(metrics, "day_strain", now)}
      weekLabel={t("lens_week")}
      monthLabel={t("lens_month")}
      trendCaption={t("strain_caption")}
    />
  );
}
