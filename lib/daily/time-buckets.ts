import { getLocalParts } from "@/lib/utils/tz";

/**
 * Group the day's agenda into Morning / Afternoon / Evening, in the user's
 * local time (Apple-calendar pattern). Pure: it buckets, it does not fetch.
 * Undated items fall into a separate "anytime" bucket the caller may ignore.
 */

export type DayBucket = "morning" | "afternoon" | "evening";
export const DAY_BUCKETS: DayBucket[] = ["morning", "afternoon", "evening"];

/** Morning < 12:00, Afternoon 12:00 to 16:59, Evening >= 17:00. */
export function bucketForHour(hour: number): DayBucket {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export type TimedItem = { whenISO: string | null };

export type Bucketed<T extends TimedItem> = {
  morning: T[];
  afternoon: T[];
  evening: T[];
  anytime: T[];
};

/** Bucket items by their local hour. Within each bucket order is preserved. */
export function bucketByTime<T extends TimedItem>(
  items: T[],
  tz: string | null,
): Bucketed<T> {
  const out: Bucketed<T> = { morning: [], afternoon: [], evening: [], anytime: [] };
  for (const it of items) {
    if (!it.whenISO) {
      out.anytime.push(it);
      continue;
    }
    const d = new Date(it.whenISO);
    if (Number.isNaN(d.getTime())) {
      out.anytime.push(it);
      continue;
    }
    out[bucketForHour(getLocalParts(d, tz).hour)].push(it);
  }
  return out;
}
