import { describe, it, expect } from "vitest";
import {
  buildWeekSeries,
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
});
