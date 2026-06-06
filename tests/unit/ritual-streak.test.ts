import { describe, it, expect } from "vitest";
import {
  computeStreak,
  matchRitualByText,
  isScheduledOnDay,
  weekdayOf,
  addDays,
  FREEZE_CAP,
} from "@/lib/rituals/streak";

const daily = (startYmd: string, todayYmd: string, completed: string[]) =>
  computeStreak({ cadence: "daily", days: [], startYmd, todayYmd, completed: new Set(completed) });

function range(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

describe("ritual streak", () => {
  it("date helpers are zone-free", () => {
    expect(weekdayOf("2026-06-04")).toBe(4); // Thursday
    expect(weekdayOf("2026-06-01")).toBe(1); // Monday
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("streak continues across consecutive completed days", () => {
    const r = daily("2026-06-08", "2026-06-10", ["2026-06-08", "2026-06-09", "2026-06-10"]);
    expect(r.current).toBe(3);
    expect(r.best).toBe(3);
    expect(r.doneToday).toBe(true);
    expect(r.scheduledToday).toBe(true);
  });

  it("today not done yet is pending, not a break", () => {
    const r = daily("2026-06-01", "2026-06-10", range("2026-06-01", "2026-06-09"));
    expect(r.current).toBe(9); // today pending, streak held
    expect(r.doneToday).toBe(false);
    expect(r.best).toBe(9);
  });

  it("breaks with no freeze available", () => {
    // 2 completions, miss on day 3 (no freeze yet), then 7 more.
    const completed = ["2026-06-01", "2026-06-02", ...range("2026-06-04", "2026-06-10")];
    const r = daily("2026-06-01", "2026-06-10", completed);
    expect(r.current).toBe(7); // 06-04..06-10
    expect(r.best).toBe(7);
    expect(r.frozenMissDates).toEqual([]);
    expect(r.freezes).toBe(1); // 9 completions -> 1 freeze earned, none consumed
  });

  it("a freeze saves a missed day", () => {
    // 7 completions earn a freeze, miss day 8 (frozen), then 2 more.
    const completed = [...range("2026-06-01", "2026-06-07"), "2026-06-09", "2026-06-10"];
    const r = daily("2026-06-01", "2026-06-10", completed);
    expect(r.current).toBe(9); // streak survives the frozen miss
    expect(r.best).toBe(9);
    expect(r.freezes).toBe(0); // the one earned freeze was consumed
    expect(r.frozenMissDates).toEqual(["2026-06-08"]);
  });

  it("freezes accrue per 7 and are capped", () => {
    // 30 consecutive completed days -> would earn 4, capped at 3.
    const start = addDays("2026-06-10", -29);
    const r = daily(start, "2026-06-10", range(start, "2026-06-10"));
    expect(r.current).toBe(30);
    expect(r.freezes).toBe(FREEZE_CAP);
  });

  it("weekday-only cadence: misses on unscheduled days never break", () => {
    // Mon/Wed/Fri = [1,3,5]. Scheduled in window: 06-01,06-03,06-05,06-08,06-10.
    const days = [1, 3, 5];
    const completed = new Set([
      "2026-06-01",
      "2026-06-03",
      "2026-06-05",
      "2026-06-08",
      "2026-06-10",
    ]);
    const r = computeStreak({
      cadence: "weekly",
      days,
      startYmd: "2026-06-01",
      todayYmd: "2026-06-10",
      completed,
    });
    expect(r.current).toBe(5); // every scheduled day done; Tue/Thu/Sat/Sun ignored
    expect(r.best).toBe(5);
    expect(r.scheduledToday).toBe(true); // 06-10 is a Wednesday
    expect(r.doneToday).toBe(true);
    expect(isScheduledOnDay("weekly", days, "2026-06-02")).toBe(false); // Tuesday
  });

  it("weekday-only: an unscheduled today reports not scheduled, streak from past", () => {
    const days = [1, 3, 5];
    const completed = new Set(["2026-06-01", "2026-06-03", "2026-06-05", "2026-06-08"]);
    const r = computeStreak({
      cadence: "weekly",
      days,
      startYmd: "2026-06-01",
      todayYmd: "2026-06-09", // Tuesday, not scheduled
      completed,
    });
    expect(r.scheduledToday).toBe(false);
    expect(r.doneToday).toBe(false);
    expect(r.current).toBe(4); // four scheduled days, all done
  });

  it("empty history is a zero streak", () => {
    const r = daily("2026-06-10", "2026-06-10", []);
    expect(r.current).toBe(0);
    expect(r.best).toBe(0);
    expect(r.freezes).toBe(0);
    expect(r.doneToday).toBe(false);
  });
});

describe("matchRitualByText", () => {
  const rituals = [
    { id: "a", title: "Meditate" },
    { id: "b", title: "Read 20 pages" },
  ];

  it("matches a ritual by a shared word", () => {
    expect(matchRitualByText("mark meditate done", rituals)?.id).toBe("a");
    expect(matchRitualByText("log read", rituals)?.id).toBe("b");
  });

  it("returns null with no shared word", () => {
    expect(matchRitualByText("walk the dog", rituals)).toBeNull();
    expect(matchRitualByText("done today", rituals)).toBeNull(); // only stop words
  });

  it("returns null on an ambiguous tie", () => {
    const two = [
      { id: "m", title: "Morning walk" },
      { id: "e", title: "Evening walk" },
    ];
    expect(matchRitualByText("did my walk", two)).toBeNull();
  });
});
