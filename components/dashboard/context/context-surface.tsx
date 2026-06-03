import { getTranslations } from "next-intl/server";
import type { ContextSurface as ContextSurfaceData } from "@/lib/daily/context-surface";
import { ContextChart } from "./context-chart";
import { ContextTicker } from "./context-ticker";

/**
 * F7: the per-context hero/chart/ticker. Each archetype (Personal, Investor,
 * Business, Family Office) leads with its own headline stat, its own chart, and
 * its own ticker, all built on the two shared primitives. This is the
 * "same product, infinite shapes" thesis in the daily surface.
 */
export async function ContextSurface({ surface }: { surface: ContextSurfaceData }) {
  const t = await getTranslations("contextSurface");
  const { archetype, hero, chart, ticker } = surface;

  const localizedChart = chart
    ? {
        ...chart,
        points:
          archetype === "family_office"
            ? chart.points.map((p) => ({ ...p, label: t(`category_${p.label}`) }))
            : chart.points,
        caption: t(chart.caption),
      }
    : null;

  return (
    <section className="rounded-2xl border border-line bg-surface-raised p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-ink-faint">
            {t(`title_${archetype}`)}
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-[26px] font-semibold leading-none text-ink">{hero.stat}</span>
            <span className="text-[12.5px] text-ink-muted">{t(hero.statLabel)}</span>
          </p>
        </div>
      </div>

      {localizedChart ? (
        <div className="mt-4">
          <ContextChart
            kind={localizedChart.kind}
            points={localizedChart.points}
            caption={localizedChart.caption}
          />
        </div>
      ) : null}

      {ticker.length ? (
        <div className="mt-3">
          <ContextTicker items={ticker} />
        </div>
      ) : (
        <p className="mt-3 text-[12.5px] text-ink-faint">{t("empty")}</p>
      )}
    </section>
  );
}
