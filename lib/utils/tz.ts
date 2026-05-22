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
 * Midnight of `d` in the given IANA timezone, returned as a Date.
 * If `tz` is invalid or empty, falls back to UTC.
 */
export function startOfDayInTz(d: Date, tz: string | null | undefined): Date {
  const zone = tz && isValidTz(tz) ? tz : "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const second = Number(parts.find((p) => p.type === "second")?.value ?? "0");
    // "24" sometimes appears at midnight; clamp to 0.
    const h24 = hour === 24 ? 0 : hour;
    const elapsedSeconds = h24 * 3600 + minute * 60 + second;
    return new Date(d.getTime() - elapsedSeconds * 1000);
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
export function sameDayInTz(
  a: Date,
  b: Date,
  tz: string | null | undefined,
): boolean {
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

function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
