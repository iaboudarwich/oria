"use client";

import { useState } from "react";
import { ContextChart } from "@/components/dashboard/context/context-chart";
import type { ChartPoint } from "@/lib/daily/context-surface";

/**
 * Trend with a time-lens toggle (1 week / 1 month), reusing the existing
 * ContextChart for the drawing. The caller passes both series; the toggle swaps
 * which one ContextChart renders. Labels are passed in localized. Segmented
 * control is keyboard + screen-reader friendly (real buttons, aria-pressed).
 */
export function TrendChart({
  week,
  month,
  kind = "line",
  caption,
  weekLabel,
  monthLabel,
}: {
  week: ChartPoint[];
  month: ChartPoint[];
  kind?: "bar" | "line";
  caption?: string;
  weekLabel: string;
  monthLabel: string;
}) {
  const [lens, setLens] = useState<"week" | "month">("week");
  const points = lens === "week" ? week : month;

  const tab = (key: "week" | "month", label: string) => (
    <button
      type="button"
      onClick={() => setLens(key)}
      aria-pressed={lens === key}
      className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-base ${
        lens === key ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 self-start rounded-xl border border-line bg-surface p-0.5">
        {tab("week", weekLabel)}
        {tab("month", monthLabel)}
      </div>
      {points.length ? (
        <ContextChart kind={kind} points={points} caption={caption} />
      ) : (
        <p className="px-1 text-[11.5px] text-ink-faint">{caption}</p>
      )}
    </div>
  );
}
