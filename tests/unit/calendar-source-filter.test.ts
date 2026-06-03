import { describe, it, expect } from "vitest";
import {
  filterBySources,
  DEFAULT_CALENDAR_SOURCES,
  type CalendarEntry,
  type CalendarSource,
  type CalendarSourcePrefs,
} from "@/lib/data/calendar-types";

// filterBySources only reads `sourceGroup`, so a minimal cast is enough.
function entry(id: string, sourceGroup: CalendarSource): CalendarEntry {
  return { id, sourceGroup } as CalendarEntry;
}

const entries = [
  entry("a", "events"),
  entry("b", "reminders"),
  entry("c", "bills"),
  entry("d", "events"),
];

describe("filterBySources (calendar source filter, F3)", () => {
  it("returns everything when all sources are on (default)", () => {
    expect(filterBySources(entries, DEFAULT_CALENDAR_SOURCES)).toHaveLength(4);
  });

  it("hides reminders when toggled off", () => {
    const out = filterBySources(entries, { events: true, reminders: false, bills: true });
    expect(out.map((e) => e.id)).toEqual(["a", "c", "d"]);
  });

  it("hides bills when toggled off", () => {
    const out = filterBySources(entries, { events: true, reminders: true, bills: false });
    expect(out.map((e) => e.id)).toEqual(["a", "b", "d"]);
  });

  it("can hide every source at once", () => {
    expect(filterBySources(entries, { events: false, reminders: false, bills: false })).toEqual([]);
  });

  it("treats a missing source key as on", () => {
    const out = filterBySources(entries, { events: true, reminders: true } as CalendarSourcePrefs);
    expect(out).toHaveLength(4);
  });
});
