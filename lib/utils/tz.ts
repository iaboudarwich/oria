/**
 * Timezone-aware day helpers.
 *
 * The server runs in iad1 (US East). Without help, `new Date()` and
 * friends compute "today" in UTC-ish, which is wrong for users far
 * from the server. We let the client tell us its IANA timezone (via
 * the `oria_tz` cookie set by TimezoneCookie) and compute day
 * boundaries against it.
 *
 * Trade-offs: zero deps, no Intl reverse-resolution. We format the
 * input instant in the target TZ to extract hour/minute/second, then
 * walk backward from the input by that elapsed-since-midnight delta
 * to land on local midnight (expressed as a UTC Date object).
 */

const ORIA_TZ_COOKIE = "oria_tz";

export function getOriaTzCookieName(): string {
  return ORIA_TZ_COOKIE;
}

/**
 * Midnight of `d` in the given IANA timezone, returned as a Date
 * pointing at the corresponding UTC instant.
 *
 * Naive elapsed-since-midnight subtraction is off by one hour around
 * DST transitions (the input's wall clock has shifted but midnight
 * earlier in the day has not). We instead:
 *   1. Format the input to extract the local YYYY-MM-DD.
 *   2. Start with a guess of "local YYYY-MM-DD at 00:00 UTC".
 *   3. Iterate a few times: format the guess in the zone, then nudge
 *      until the wall clock in the zone reads 00:00 on the right day.
 *
 * Converges within 3 iterations for every real timezone, including
 * DST spring-forward and fall-back. Falls back to UTC midnight on a
 * bad zone.
 */
export function startOfDayInTz(d: Date, tz: string | null | undefined): Date {
  const zone = tz && isValidTz(tz) ? tz : "UTC";
  try {
    const dayFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const localDay = dayFmt.format(d);
    let guess = new Date(`${localDay}T00:00:00Z`);

    const fullFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    for (let i = 0; i < 4; i++) {
      const parts = fullFmt.formatToParts(guess);
      const map: Record<string, string> = {};
      for (const p of parts) map[p.type] = p.value;
      const guessDay = `${map.year}-${map.month}-${map.day}`;
      const hour = map.hour === "24" ? 0 : Number(map.hour ?? "0");
      const minute = Number(map.minute ?? "0");
      const second = Number(map.second ?? "0");
      const hms = hour * 3600 + minute * 60 + second;
      const cmp = guessDay < localDay ? -1 : guessDay > localDay ? 1 : 0;
      if (cmp === 0 && hms === 0) return guess;
      if (cmp === 0) {
        guess = new Date(guess.getTime() - hms * 1000);
      } else if (cmp < 0) {
        // Guess is on an earlier local day; push forward by what's
        // left of that day in zone wall-clock terms.
        guess = new Date(guess.getTime() + (24 * 3600 - hms) * 1000);
      } else {
        guess = new Date(guess.getTime() - (24 * 3600 + hms) * 1000);
      }
    }
    return guess;
  } catch {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x;
  }
}

/**
 * Returns true when two dates fall on the same calendar day in the
 * given TZ. Used to bucket meals into the Today list.
 */
export function sameDayInTz(a: Date, b: Date, tz: string | null | undefined): boolean {
  const zone = tz && isValidTz(tz) ? tz : "UTC";
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(a) === fmt.format(b);
  } catch {
    return (
      a.getUTCFullYear() === b.getUTCFullYear() &&
      a.getUTCMonth() === b.getUTCMonth() &&
      a.getUTCDate() === b.getUTCDate()
    );
  }
}

/**
 * Wall-clock parts of an instant in a timezone: hour (0-23), day-of-week
 * (0=Sunday), and the local calendar date (yyyy-mm-dd). Used by the daily-loop
 * cron to decide which per-user-local schedules are due this hour. Falls back
 * to UTC parts on a bad zone.
 */
export function getLocalParts(
  d: Date,
  tz: string | null | undefined,
): { hour: number; dayOfWeek: number; ymd: string } {
  const zone = tz && isValidTz(tz) ? tz : "UTC";
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    const parts: Record<string, string> = {};
    for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
    const hour = parts.hour === "24" ? 0 : Number(parts.hour ?? "0");
    const ymd = `${parts.year}-${parts.month}-${parts.day}`;
    const dows: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const dayOfWeek = dows[parts.weekday ?? "Sun"] ?? 0;
    return { hour, dayOfWeek, ymd };
  } catch {
    return {
      hour: d.getUTCHours(),
      dayOfWeek: d.getUTCDay(),
      ymd: d.toISOString().slice(0, 10),
    };
  }
}

/**
 * Convert a wall-clock date + time the user typed (e.g. "2026-06-05" + "14:00")
 * into the exact UTC instant, interpreting it in the given IANA timezone. This
 * is how a reminder's due time is stored: 2pm in the user's zone is 2pm there,
 * never re-zoned through the server's clock. Returns null on bad input so the
 * caller can refuse rather than guess (no silent fallback to "now").
 *
 * Method: guess the instant as if the wall-clock were UTC, measure how far that
 * guess's wall-clock in the target zone is from UTC, and shift by that offset.
 * The offset is read at the guess instant, so it follows DST. Pure + tested.
 */
export function localDateTimeToISO(
  date: string,
  time: string,
  tz: string | null | undefined,
): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? "").trim());
  const tm = /^(\d{2}):(\d{2})/.exec((time ?? "").trim());
  if (!dm || !tm) return null;
  const [, y, mo, d] = dm.map(Number);
  const [, hh, mm] = tm.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  const zone = tz && isValidTz(tz) ? tz : "UTC";

  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  try {
    // What wall-clock does `guess` show in the target zone vs in UTC? The
    // difference is the zone's offset at that instant.
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts: Record<string, number> = {};
    for (const p of fmt.formatToParts(new Date(guess))) {
      if (p.type !== "literal") parts[p.type] = Number(p.value);
    }
    const asZoneUTC = Date.UTC(
      parts.year,
      (parts.month ?? 1) - 1,
      parts.day ?? 1,
      parts.hour === 24 ? 0 : (parts.hour ?? 0),
      parts.minute ?? 0,
      parts.second ?? 0,
    );
    const offset = asZoneUTC - guess; // zone is ahead of UTC by `offset`
    return new Date(guess - offset).toISOString();
  } catch {
    return new Date(guess).toISOString();
  }
}

function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
