import { describe, it, expect } from "vitest";
import { startOfDayInTz, sameDayInTz } from "@/lib/utils/tz";

/**
 * Returns the YYYY-MM-DD label of `d` in the given IANA timezone.
 * Used to verify startOfDayInTz lands on the right local day.
 */
function ymdInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

describe("startOfDayInTz", () => {
  it("returns the input unchanged-as-day in UTC", () => {
    const now = new Date("2026-05-22T05:00:00Z");
    const s = startOfDayInTz(now, "UTC");
    expect(ymdInTz(s, "UTC")).toBe("2026-05-22");
    expect(s.toISOString()).toBe("2026-05-22T00:00:00.000Z");
  });

  it("respects Pacific (PT) timezone — past midnight local", () => {
    // 07:30 UTC = 00:30 PDT (May 22). Start of day = midnight PT.
    const now = new Date("2026-05-22T07:30:00Z");
    const s = startOfDayInTz(now, "America/Los_Angeles");
    expect(ymdInTz(s, "America/Los_Angeles")).toBe("2026-05-22");
  });

  it("respects Pacific timezone — before midnight local", () => {
    // 06:30 UTC = 23:30 PDT (May 21). Start of day = midnight PT on May 21.
    const now = new Date("2026-05-22T06:30:00Z");
    const s = startOfDayInTz(now, "America/Los_Angeles");
    expect(ymdInTz(s, "America/Los_Angeles")).toBe("2026-05-21");
  });

  it("respects Tokyo (+9, no DST)", () => {
    // 15:00 UTC = next day 00:00 Tokyo. Start of next-day in Tokyo.
    const now = new Date("2026-05-22T15:00:00Z");
    const s = startOfDayInTz(now, "Asia/Tokyo");
    expect(ymdInTz(s, "Asia/Tokyo")).toBe("2026-05-23");
  });

  it("respects Honolulu (-10, no DST)", () => {
    // 05:00 UTC = 19:00 HST prev day. Start of day = May 21 in HST.
    const now = new Date("2026-05-22T05:00:00Z");
    const s = startOfDayInTz(now, "Pacific/Honolulu");
    expect(ymdInTz(s, "Pacific/Honolulu")).toBe("2026-05-21");
  });

  it("handles DST spring-forward day (PT, 2026-03-08)", () => {
    // 11:00 UTC on March 8 = 04:00 PDT (after DST kicks in). Start of
    // "today in PT" must be 00:00 PST = 08:00 UTC, NOT 07:00 UTC (the
    // naive elapsed-since-wall-midnight subtraction error).
    const now = new Date("2026-03-08T11:00:00Z");
    const s = startOfDayInTz(now, "America/Los_Angeles");
    expect(ymdInTz(s, "America/Los_Angeles")).toBe("2026-03-08");
    expect(s.toISOString()).toBe("2026-03-08T08:00:00.000Z");
  });

  it("handles DST fall-back day (PT, 2026-11-01)", () => {
    const now = new Date("2026-11-01T08:30:00Z");
    const s = startOfDayInTz(now, "America/Los_Angeles");
    expect(ymdInTz(s, "America/Los_Angeles")).toBe("2026-11-01");
  });

  it("falls back to UTC midnight when tz is invalid", () => {
    const now = new Date("2026-05-22T05:00:00Z");
    const s = startOfDayInTz(now, "Not/A/Real");
    // Invalid TZ → treats as UTC.
    expect(ymdInTz(s, "UTC")).toBe("2026-05-22");
  });

  it("falls back to UTC midnight when tz is empty/null", () => {
    const now = new Date("2026-05-22T05:00:00Z");
    const s1 = startOfDayInTz(now, "");
    const s2 = startOfDayInTz(now, null);
    expect(ymdInTz(s1, "UTC")).toBe("2026-05-22");
    expect(ymdInTz(s2, "UTC")).toBe("2026-05-22");
  });
});

describe("sameDayInTz", () => {
  it("treats two times on the same PT day as same day", () => {
    const a = new Date("2026-05-22T18:00:00Z"); // 11am PT
    const b = new Date("2026-05-23T02:00:00Z"); // 19:00 PT same day
    expect(sameDayInTz(a, b, "America/Los_Angeles")).toBe(true);
  });

  it("treats UTC same-day as different PT days when one crosses midnight", () => {
    const a = new Date("2026-05-22T07:00:00Z"); // 00:00 PT May 22
    const b = new Date("2026-05-22T06:00:00Z"); // 23:00 PT May 21
    expect(sameDayInTz(a, b, "America/Los_Angeles")).toBe(false);
  });

  it("respects Tokyo day boundary independently from UTC", () => {
    // Both these UTC times fall on Tokyo's May 23.
    const a = new Date("2026-05-22T18:00:00Z");
    const b = new Date("2026-05-22T20:00:00Z");
    expect(sameDayInTz(a, b, "Asia/Tokyo")).toBe(true);
  });

  it("falls back to UTC date comparison on invalid tz", () => {
    const a = new Date("2026-05-22T07:00:00Z");
    const b = new Date("2026-05-22T18:00:00Z");
    expect(sameDayInTz(a, b, "Not/A/Real")).toBe(true);
  });
});
