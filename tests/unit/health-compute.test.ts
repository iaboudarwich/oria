import { describe, it, expect } from "vitest";
import {
  buildWeekSeries,
  buildDaySeries,
  buildMonthSeries,
  formatSleepDuration,
  netBalance,
  utcDayKey,
} from "@/lib/health/compute";

describe("health compute", () => {
  const now = new Date("2026-06-04T12:00:00Z");

  it("builds a 7-day series ending today, missing days zeroed", () => {
    const rows = [
      { metric_date: "2026-06-04", recovery_score: 70 },
      { metric_date: "2026-06-02", recovery_score: 55 },
    ];
    const s = buildWeekSeries(rows, "recovery_score", now);
    expect(s).toHaveLength(7);
    expect(s[6].value).toBe(70); // today (last bar)
    expect(s[4].value).toBe(55); // two days ago
    expect(s[5].value).toBe(0); // yesterday, no data
    expect(s[6].label).toBe("Thu"); // 2026-06-04 is a Thursday
  });

  it("ignores non-numeric values", () => {
    const rows = [{ metric_date: "2026-06-04", recovery_score: null }];
    const s = buildWeekSeries(rows as never, "recovery_score", now);
    expect(s[6].value).toBe(0);
  });

  it("formats sleep duration, null when empty", () => {
    expect(formatSleepDuration(472)).toBe("7h 52m");
    expect(formatSleepDuration(0)).toBeNull();
    expect(formatSleepDuration(null)).toBeNull();
  });

  it("nets calorie balance only when both sides present", () => {
    expect(netBalance(2000, 2500)).toBe(-500); // deficit
    expect(netBalance(2800, 2500)).toBe(300); // surplus
    expect(netBalance(2000, null)).toBeNull();
    expect(netBalance(null, 2500)).toBeNull();
  });

  it("utcDayKey is the date slice", () => {
    expect(utcDayKey(new Date("2026-06-04T23:30:00Z"))).toBe("2026-06-04");
  });

  it("buildDaySeries(7) matches buildWeekSeries", () => {
    const rows = [
      { metric_date: "2026-06-04", day_strain: 14.2 },
      { metric_date: "2026-06-01", day_strain: 9 },
    ];
    expect(buildDaySeries(rows, "day_strain", now, 7)).toEqual(
      buildWeekSeries(rows, "day_strain", now),
    );
  });

  it("buildMonthSeries is 30 points, today last, with sparse day-number labels", () => {
    const rows = [{ metric_date: "2026-06-04", recovery_score: 80 }];
    const s = buildMonthSeries(rows, "recovery_score", now);
    expect(s).toHaveLength(30);
    expect(s[29].value).toBe(80); // today, last point
    expect(s[29].label).toBe("4"); // today's day-of-month is labelled
    expect(s[0].label).toBe("6"); // 29 days before 2026-06-04 is 2026-05-06
    // interior days between weekly marks are blank so 30 bars stay readable
    expect(s[1].label).toBe("");
  });
});
