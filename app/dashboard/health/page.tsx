import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { requireContext } from "@/lib/data/organizations";
import { listWhoopConnections } from "@/lib/whoop/connections";
import { listHealthMetrics, kjToKcal, type HealthMetric } from "@/lib/data/health-data";
import { listDietMeals, sumMacros } from "@/lib/data/smart-sections";
import { sameDayInTz } from "@/lib/utils/tz";
import { HealthTabs, isHealthTab } from "@/components/health/health-tabs";
import { BodyPanel } from "@/components/health/body-panel";
import { DietPanel } from "@/components/health/diet-panel";
import { MovementPanel } from "@/components/health/movement-panel";
import { SleepPanel } from "@/components/health/sleep-panel";
import { VitalsPanel } from "@/components/health/vitals-panel";
import { SupplementsPanel } from "@/components/health/supplements-panel";
import { RitualsPanel } from "@/components/health/rituals-panel";
import { utcDayKey } from "@/lib/health/compute";

export const metadata = { title: "Health" };

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** Today's WHOOP burn (kcal) from the day's energy, if present. */
function todayBurnKcal(metrics: HealthMetric[], now: Date): number | null {
  const key = utcDayKey(now);
  const row = metrics.find((m) => m.metric_date === key);
  return row ? kjToKcal(row.day_kilojoule) : null;
}

/** Today's logged calories, in the user's local day. */
async function todayIntakeKcal(now: Date, tz: string): Promise<number | null> {
  const since = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const meals = await listDietMeals({ since, limit: 50 });
  const todays = meals.filter((m) =>
    m.occurred_at ? sameDayInTz(new Date(m.occurred_at), now, tz) : false,
  );
  if (todays.length === 0) return null;
  return Math.round(sumMacros(todays).calories);
}

export default async function HealthPage({ searchParams }: Props) {
  const sp: Record<string, string | string[] | undefined> = await (searchParams ??
    Promise.resolve({}));
  const tabParam = typeof sp.tab === "string" ? sp.tab : undefined;
  const htype = typeof sp.htype === "string" ? sp.htype : undefined;
  const whoopOutcome =
    sp.whoop === "connected" ? "connected" : sp.whoop === "error" ? "error" : null;
  const active = isHealthTab(tabParam) ? tabParam : "body";

  const ctx = await requireContext();
  const t = await getTranslations("health");
  const now = new Date();
  const tz = (await cookies()).get("oria_tz")?.value ?? "UTC";
  const acknowledged =
    (ctx.profile as unknown as Record<string, unknown>).connect_privacy_ack_at != null;

  // Fetch per-tab so a tab pays only for what it shows.
  let body: React.ReactNode = null;
  if (active === "body") {
    const [metrics, whoop, intake] = await Promise.all([
      listHealthMetrics(),
      listWhoopConnections(ctx.profile.id),
      todayIntakeKcal(now, tz),
    ]);
    body = (
      <BodyPanel
        metrics={metrics}
        whoopConnected={whoop.length > 0}
        acknowledged={acknowledged}
        intakeKcal={intake}
        burnKcal={todayBurnKcal(metrics, now)}
        now={now}
      />
    );
  } else if (active === "diet") {
    const metrics = await listHealthMetrics();
    body = <DietPanel burnKcal={todayBurnKcal(metrics, now)} />;
  } else if (active === "movement") {
    const [metrics, whoop] = await Promise.all([
      listHealthMetrics(),
      listWhoopConnections(ctx.profile.id),
    ]);
    body = (
      <MovementPanel
        metrics={metrics}
        whoopConnected={whoop.length > 0}
        acknowledged={acknowledged}
        now={now}
      />
    );
  } else if (active === "sleep") {
    const [metrics, whoop] = await Promise.all([
      listHealthMetrics(),
      listWhoopConnections(ctx.profile.id),
    ]);
    body = (
      <SleepPanel
        metrics={metrics}
        whoopConnected={whoop.length > 0}
        acknowledged={acknowledged}
        now={now}
      />
    );
  } else if (active === "vitals") {
    body = <VitalsPanel orgId={ctx.organization.id} filter={htype} />;
  } else if (active === "supplements") {
    body = <SupplementsPanel />;
  } else {
    body = <RitualsPanel />;
  }

  return (
    <>
      <Topbar title={t("title")} />
      <div className="animate-fade-up">
        {whoopOutcome ? (
          <div
            role="status"
            className={`mb-4 rounded-xl border px-4 py-3 text-[13px] ${
              whoopOutcome === "connected"
                ? "border-sage/40 bg-sage/10 text-ink"
                : "border-claret/40 bg-claret/10 text-ink"
            }`}
          >
            {whoopOutcome === "connected" ? t("whoop_connect_ok") : t("whoop_connect_failed")}
          </div>
        ) : null}
        <HealthTabs active={active} />
        {body}
      </div>
    </>
  );
}
