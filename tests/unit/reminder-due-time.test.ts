import { describe, it, expect } from "vitest";
import { localDateTimeToISO } from "@/lib/utils/tz";

/**
 * Regression for the reminder-time bug: a reminder created for a specific local
 * date + time must store the exact UTC instant for that wall-clock in the user's
 * timezone (no server-clock re-zoning, no silent default), and read back to the
 * same wall-clock.
 */
describe("localDateTimeToISO", () => {
  it("interprets the wall-clock in the user's timezone (DST zone)", () => {
    // 2pm on 2026-06-05 in New York is EDT (UTC-4) -> 18:00 UTC.
    expect(localDateTimeToISO("2026-06-05", "14:00", "America/New_York")).toBe(
      "2026-06-05T18:00:00.000Z",
    );
  });

  it("interprets the wall-clock in a non-DST zone", () => {
    // Tokyo is UTC+9 year-round -> 2pm local is 05:00 UTC.
    expect(localDateTimeToISO("2026-06-05", "14:00", "Asia/Tokyo")).toBe(
      "2026-06-05T05:00:00.000Z",
    );
  });

  it("round-trips: the stored instant reads back as the same wall-clock", () => {
    const tz = "America/Los_Angeles";
    const iso = localDateTimeToISO("2026-06-05", "14:00", tz)!;
    const back = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
    expect(back).toBe("14:00");
  });

  it("handles a winter date in the same zone (offset differs from summer)", () => {
    // 2026-01-05 in New York is EST (UTC-5) -> 19:00 UTC for 2pm.
    expect(localDateTimeToISO("2026-01-05", "14:00", "America/New_York")).toBe(
      "2026-01-05T19:00:00.000Z",
    );
  });

  it("refuses bad input instead of guessing (no fallback to now)", () => {
    expect(localDateTimeToISO("2026-06-05", "", "America/New_York")).toBeNull();
    expect(localDateTimeToISO("", "14:00", "America/New_York")).toBeNull();
    expect(localDateTimeToISO("not-a-date", "14:00", "UTC")).toBeNull();
  });

  it("falls back to UTC interpretation when the zone is missing", () => {
    expect(localDateTimeToISO("2026-06-05", "14:00", null)).toBe(
      "2026-06-05T14:00:00.000Z",
    );
  });
});
