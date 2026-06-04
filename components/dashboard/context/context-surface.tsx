import { getTranslations } from "next-intl/server";
import type { ContextSurface as ContextSurfaceData } from "@/lib/daily/context-surface";
import { GlassCard } from "@/components/ui/glass-card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { HeroNumber } from "@/components/ui/hero-number";
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
    <GlassCard>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <Eyebrow>{t(`title_${archetype}`)}</Eyebrow>
          <HeroNumber className="mt-1.5" value={hero.stat} label={t(hero.statLabel)} />
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
          <ContextTicker items={ticker} label={t("ticker_label")} />
        </div>
      ) : (
        <p className="mt-3 text-[12.5px] text-ink-faint">{t("empty")}</p>
      )}
    </GlassCard>
  );
}
