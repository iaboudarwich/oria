import { getLocalParts } from "@/lib/utils/tz";

/**
 * Saved views: Smart-List-style filters over the existing flat reminder/event
 * model. A view SURFACES items, it never owns them, so this is pure and reads
 * nothing of its own. Today / Overdue / Flagged / This week / All, all computed
 * in the user's local day so "today" and "this week" are timezone-correct.
 */

export type SavedViewKey = "today" | "overdue" | "this_week" | "flagged" | "all";

export const SAVED_VIEW_KEYS: SavedViewKey[] = ["today", "overdue", "this_week", "flagged", "all"];

/** The minimal shape a saved view filters on. Reminders and events both map to
 *  this; nothing here depends on which it is. */
export type ViewItem = {
  id: string;
  /** The instant it is due / starts, or null for an undated item. */
  whenISO: string | null;
  done?: boolean;
  flagged?: boolean;
};

function localYmd(iso: string, tz: string | null): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return getLocalParts(d, tz).ymd;
}

/** Filter items for a saved view, in the user's local day. Done items are
 *  excluded from the time-bound views (they are no longer "to do"). */
export function filterSavedView(
  items: ViewItem[],
  view: SavedViewKey,
  nowISO: string,
  tz: string | null,
): ViewItem[] {
  if (view === "all") return items.slice();
  if (view === "flagged") return items.filter((i) => i.flagged === true);

  const todayYmd = getLocalParts(new Date(nowISO), tz).ymd;
  const open = items.filter((i) => !i.done);

  if (view === "today") {
    return open.filter((i) => i.whenISO && localYmd(i.whenISO, tz) === todayYmd);
  }
  if (view === "overdue") {
    return open.filter((i) => {
      const ymd = i.whenISO && localYmd(i.whenISO, tz);
      return !!ymd && ymd < todayYmd;
    });
  }
  // this_week: today through the next 6 local days (inclusive), dated items only.
  const end = addLocalDays(todayYmd, 6);
  return open.filter((i) => {
    const ymd = i.whenISO && localYmd(i.whenISO, tz);
    return !!ymd && ymd >= todayYmd && ymd <= end;
  });
}

/** Count per view, for the view chips. */
export function savedViewCounts(
  items: ViewItem[],
  nowISO: string,
  tz: string | null,
): Record<SavedViewKey, number> {
  const out = {} as Record<SavedViewKey, number>;
  for (const key of SAVED_VIEW_KEYS) {
    out[key] = filterSavedView(items, key, nowISO, tz).length;
  }
  return out;
}

/** Add whole days to a YYYY-MM-DD key (UTC-noon math avoids DST edge slips). */
function addLocalDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
