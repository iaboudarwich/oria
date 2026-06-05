/**
 * Pure helpers for the Health surface. No DB, no IO, fully unit-tested.
 */

export type DayValue = { date: string; value: number };

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** UTC YYYY-MM-DD for an instant. */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build a 7-day series ending on `now` (UTC days), pulling one numeric field
 * out of daily rows keyed by metric_date. Missing days are 0. Returns oldest
 * to newest with a weekday label, so the last bar is today.
 */
export function buildWeekSeries(
  rows: Array<{ metric_date: string; [k: string]: unknown }>,
  field: string,
  now: Date,
): Array<{ label: string; value: number }> {
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const v = r[field];
    if (typeof v === "number" && !Number.isNaN(v)) byDate.set(r.metric_date, v);
  }
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const out: Array<{ label: string; value: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart.getTime() - i * DAY_MS);
    out.push({ label: WEEKDAY[d.getUTCDay()], value: byDate.get(utcDayKey(d)) ?? 0 });
  }
  return out;
}

/** Whole hours + minutes from a minute count, e.g. 472 -> "7h 52m". */
export function formatSleepDuration(totalMinutes: number | null | undefined): string | null {
  if (totalMinutes === null || totalMinutes === undefined || totalMinutes <= 0) return null;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

/**
 * Net calorie balance for a day. Negative = deficit (burned more than eaten),
 * positive = surplus. Null when either side is missing so the caller can show a
 * graceful partial state instead of a misleading number.
 */
export function netBalance(
  intakeKcal: number | null,
  burnKcal: number | null,
): number | null {
  if (intakeKcal === null || burnKcal === null) return null;
  return Math.round(intakeKcal - burnKcal);
}
