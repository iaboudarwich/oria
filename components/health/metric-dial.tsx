"use client";

import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ScoreRing } from "@/components/ui/score-ring";
import { Accordion } from "@/components/ui/accordion";
import { TrendChart } from "@/components/ui/trend-chart";
import type { ChartPoint } from "@/lib/daily/context-surface";

export type Contributor = { label: string; value: string };

/**
 * One Health metric, the full deep-dive on a single screen (closes the A4
 * health deep-dive). A large semantic-colored ScoreRing leads, with a one-word
 * state read beside it; the contributors (the sub-metrics that shaped it) sit in
 * an expand-in-place Accordion; a 1-week / 1-month TrendChart shows the
 * trajectory. Insight -> evidence -> detail, all here, no navigation away.
 *
 * The arc is 0-100; `displayValue` is whatever should sit in the center (a
 * percent, or a raw strain figure), so a 0-21 strain can fill its ring by its
 * own scale while showing its real number. Every value is passed in from real
 * metrics; an empty trend simply does not render.
 */
export function MetricDial({
  title,
  arcScore,
  displayValue,
  unit,
  colorVar,
  trackVar,
  state,
  contributors,
  contributorsLabel,
  contributorsHint,
  week,
  month,
  weekLabel,
  monthLabel,
  trendCaption,
}: {
  title: string;
  arcScore: number;
  displayValue: string;
  unit?: string;
  colorVar: string;
  trackVar: string;
  state?: string;
  contributors: Contributor[];
  contributorsLabel: string;
  contributorsHint?: string;
  week: ChartPoint[];
  month: ChartPoint[];
  weekLabel: string;
  monthLabel: string;
  trendCaption?: string;
}) {
  const hasTrend = week.some((p) => p.value > 0) || month.some((p) => p.value > 0);
  const center: ReactNode = (
    <span className="flex items-baseline gap-0.5">
      <span className="num text-[26px] leading-none font-semibold" style={{ color: colorVar }}>
        {displayValue}
      </span>
      {unit ? <span className="text-[12px] text-ink-muted">{unit}</span> : null}
    </span>
  );

  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-center gap-5">
        <ScoreRing
          score={arcScore}
          size={108}
          colorVar={colorVar}
          trackVar={trackVar}
          center={center}
          ariaLabel={`${title} ${displayValue}${unit ?? ""}`}
        />
        <div className="min-w-0">
          <Eyebrow>{title}</Eyebrow>
          {state ? (
            <p className="mt-1 text-[15px] font-semibold" style={{ color: colorVar }}>
              {state}
            </p>
          ) : null}
        </div>
      </div>

      {contributors.length > 0 ? (
        <div className="mt-3 border-t border-line pt-2">
          <Accordion label={contributorsLabel} hint={contributorsHint}>
            <dl className="space-y-1.5">
              {contributors.map((c) => (
                <div key={c.label} className="flex items-center justify-between gap-4">
                  <dt className="text-[13px] text-ink-muted">{c.label}</dt>
                  <dd className="num text-[13px] font-medium text-ink">{c.value}</dd>
                </div>
              ))}
            </dl>
          </Accordion>
        </div>
      ) : null}

      {hasTrend ? (
        <div className="mt-3 border-t border-line pt-3">
          <TrendChart
            week={week}
            month={month}
            kind="bar"
            weekLabel={weekLabel}
            monthLabel={monthLabel}
            caption={trendCaption}
          />
        </div>
      ) : null}
    </div>
  );
}
