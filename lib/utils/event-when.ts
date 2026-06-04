/**
 * Floating wall-clock parsing for extracted event dates.
 *
 * A date Oria extracts from a document (a flight at 6:00 AM, a hotel check-in)
 * is a LOCAL wall-clock value: the model writes the time printed on the
 * document, often mislabeling it `Z` or storing it with a +00 offset. It is NOT
 * a true UTC instant. If we feed it to `new Date(iso)` and render in the
 * viewer's timezone, a 6:00 AM June 26 flight becomes "June 25, 11:00 PM" in
 * Pacific. So for extracted (memory_item) entries we read the wall-clock date
 * and time components directly and never re-zone them.
 *
 * A midnight or date-only value means the time is UNKNOWN (the model could not
 * read it), so we mark it all-day rather than inventing a 12:00 AM / 11:00 PM.
 *
 * Pure and tested. Connector calendar events (real instants with a real
 * timezone) do NOT use this; they keep normal Date handling.
 */
export type EventWhen = {
  /** Wall-clock date, always present, "YYYY-MM-DD". */
  date: string;
  /** Wall-clock time "HH:MM" (24h), or null when unknown / all-day. */
  time: string | null;
  /** True when there is no meaningful time (date-only or midnight). */
  allDay: boolean;
};

const WHEN_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/;

/**
 * Read the wall-clock components of an ISO-ish timestamp without timezone
 * conversion. Returns null if the string has no parseable date.
 */
export function parseEventWhen(iso: string | null | undefined): EventWhen | null {
  if (!iso) return null;
  const m = WHEN_RE.exec(iso.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  const date = `${y}-${mo}-${d}`;
  if (hh === undefined || mm === undefined) return { date, time: null, allDay: true };
  // Midnight reads as "no time known", not a real 12:00 AM event.
  if (hh === "00" && mm === "00") return { date, time: null, allDay: true };
  return { date, time: `${hh}:${mm}`, allDay: false };
}
