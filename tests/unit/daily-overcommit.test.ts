import { describe, it, expect } from "vitest";
import { assessOvercommitment } from "@/lib/daily/overcommit";
import type { SignalEvent } from "@/lib/daily/signals";

// Round 16 F5: overcommitment fires on either too many meetings or too many
// hours, and surfaces the largest gap as the focus-time hold.

const ev = (id: string, startH: number, endH: number): SignalEvent => ({
  id,
  title: id,
  startsAt: `2026-06-03T${String(startH).padStart(2, "0")}:00:00Z`,
  endsAt: `2026-06-03T${String(endH).padStart(2, "0")}:00:00Z`,
  isAllDay: false,
});

describe("assessOvercommitment", () => {
  it("flags a day with five or more meetings", () => {
    const a = assessOvercommitment([
      ev("1", 9, 10),
      ev("2", 10, 11),
      ev("3", 11, 12),
      ev("4", 13, 14),
      ev("5", 14, 15),
    ]);
    expect(a.overcommitted).toBe(true);
    expect(a.meetingCount).toBe(5);
  });

  it("flags a day with six or more meeting hours", () => {
    const a = assessOvercommitment([ev("1", 9, 13), ev("2", 14, 17)]);
    expect(a.overcommitted).toBe(true);
    expect(a.meetingHours).toBe(7);
  });

  it("does not flag a light day, and ignores all-day events", () => {
    const a = assessOvercommitment([
      ev("1", 9, 10),
      { id: "x", title: "Holiday", startsAt: "2026-06-03T00:00:00Z", endsAt: null, isAllDay: true },
    ]);
    expect(a.overcommitted).toBe(false);
  });

  it("suggests the largest open gap as the focus hold", () => {
    const a = assessOvercommitment([
      ev("1", 9, 10),
      ev("2", 14, 15), // 4h gap after #1
      ev("3", 15, 16),
    ]);
    expect(a.suggestedHold).toEqual({
      startsAt: "2026-06-03T10:00:00.000Z",
      endsAt: "2026-06-03T14:00:00.000Z",
    });
  });
});
