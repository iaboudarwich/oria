"use client";

import {
  CATEGORY_DOT,
  addDays,
  bucketByDay,
  dayKey,
  isSameDay,
  shortLabel,
  startOfMonth,
  startOfWeek,
} from "./calendar-shared";
import type { CalendarEntry } from "@/lib/data/calendar-types";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Apple-Calendar-style month grid. 6 weeks × 7 days. Each cell shows the day
 * number, up to 3 colored dots (one per event), and a "+N" indicator if more.
 * Click a day to jump to Day view for that date.
 */
export function MonthGrid({
  cursor,
  entries,
  onPickDay,
}: {
  cursor: Date;
  entries: CalendarEntry[];
  onPickDay: (d: Date) => void;
}) {
  const buckets = bucketByDay(entries);
  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i));

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAY_LABELS.map((d, i) => (
          <div
            key={i}
            className="px-2 py-2 text-center text-[10.5px] uppercase tracking-[0.12em] text-ink-faint"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const isCurrentMonth = d.getMonth() === cursor.getMonth();
          const isToday = isSameDay(d, today);
          const items = buckets.get(dayKey(d)) ?? [];
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPickDay(d)}
              className={`flex min-h-[56px] flex-col items-stretch gap-1 border-b border-r border-line p-1.5 text-left transition-base hover:bg-canvas/60 last:border-r-0 sm:aspect-square sm:min-h-[78px] ${
                (i + 1) % 7 === 0 ? "border-r-0" : ""
              } ${i >= 35 ? "border-b-0" : ""} ${
                !isCurrentMonth ? "bg-canvas/30" : ""
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center self-start rounded-full text-[11px] ${
                  isToday
                    ? "bg-ink text-surface"
                    : isCurrentMonth
                      ? "text-ink"
                      : "text-ink-faint"
                }`}
              >
                {d.getDate()}
              </span>
              {items.length > 0 ? (
                <>
                  {/* Mobile: dot row only — text labels don't fit at ~40px cell width. */}
                  <div className="mt-auto flex flex-wrap items-center gap-1 sm:hidden">
                    {items.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={`inline-block h-1.5 w-1.5 rounded-full ${CATEGORY_DOT[e.category]}`}
                        title={e.title}
                      />
                    ))}
                    {items.length > 3 ? (
                      <span className="text-[10px] text-ink-faint">
                        +{items.length - 3}
                      </span>
                    ) : null}
                  </div>
                  {/* sm+: short labels + dots. */}
                  <div className="mt-1 hidden flex-col gap-0.5 sm:flex">
                    {items.slice(0, 2).map((e) => (
                      <span
                        key={e.id}
                        className="flex items-center gap-1 truncate text-[10px] leading-tight"
                        title={e.title}
                      >
                        <span
                          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${CATEGORY_DOT[e.category]}`}
                          aria-hidden
                        />
                        <span className="truncate text-ink-soft">
                          {shortLabel(e)}
                        </span>
                      </span>
                    ))}
                    {items.length > 2 ? (
                      <span className="text-[10px] text-ink-faint">
                        +{items.length - 2} more
                      </span>
                    ) : null}
                  </div>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 12 mini-month grids. Days with any event get a small dot underneath. Click
 * a month to switch to Month view for that month.
 */
export function YearGrid({
  cursor,
  entries,
  onPickMonth,
}: {
  cursor: Date;
  entries: CalendarEntry[];
  onPickMonth: (d: Date) => void;
}) {
  const buckets = bucketByDay(entries);
  const year = cursor.getFullYear();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 12 }, (_, m) => (
        <MiniMonth
          key={m}
          month={new Date(year, m, 1)}
          buckets={buckets}
          onPick={onPickMonth}
        />
      ))}
    </div>
  );
}

function MiniMonth({
  month,
  buckets,
  onPick,
}: {
  month: Date;
  buckets: Map<string, CalendarEntry[]>;
  onPick: (d: Date) => void;
}) {
  const monthStart = startOfMonth(month);
  const gridStart = startOfWeek(monthStart);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i));

  return (
    <button
      type="button"
      onClick={() => onPick(month)}
      className="rounded-xl border border-line bg-surface-raised p-3 text-left transition-base hover:border-line-strong hover:bg-canvas/40"
    >
      <p className="mb-2 text-[12.5px] font-medium text-ink">
        {month.toLocaleDateString(undefined, { month: "long" })}
      </p>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {WEEKDAY_LABELS.map((d, i) => (
          <span key={i} className="text-[9px] text-ink-faint">
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isToday = isSameDay(d, today);
          const has = (buckets.get(dayKey(d)) ?? []).length > 0;
          return (
            <span
              key={i}
              className={`flex flex-col items-center gap-0.5 text-[10px] ${
                isToday
                  ? "text-ink"
                  : inMonth
                    ? "text-ink-soft"
                    : "text-ink-faint/50"
              }`}
            >
              <span
                className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ${
                  isToday ? "bg-ink text-surface" : ""
                }`}
              >
                {d.getDate()}
              </span>
              <span
                className={`h-1 w-1 rounded-full ${
                  has && inMonth ? "bg-accent" : "bg-transparent"
                }`}
              />
            </span>
          );
        })}
      </div>
    </button>
  );
}
