import { describe, it, expect } from "vitest";
import { parseEventWhen } from "@/lib/utils/event-when";

/**
 * The flight bug: a boarding pass at 6:00 AM on June 26, written by the model as
 * a UTC-labeled value (2026-06-26 06:00:00+00), rendered as "June 25, 11:00 PM"
 * in a western timezone. parseEventWhen reads the wall-clock components without
 * re-zoning, so the date and time stay as the document printed them.
 */
describe("parseEventWhen", () => {
  it("keeps the wall-clock date and time of an offset-labeled value (the flight case)", () => {
    expect(parseEventWhen("2026-06-26 06:00:00+00")).toEqual({
      date: "2026-06-26",
      time: "06:00",
      allDay: false,
    });
  });

  it("does not slip the day regardless of the offset designator", () => {
    expect(parseEventWhen("2026-06-26T06:00:00Z")?.date).toBe("2026-06-26");
    expect(parseEventWhen("2026-06-26T06:00:00-07:00")?.date).toBe("2026-06-26");
  });

  it("treats a date-only value as all-day (unknown time)", () => {
    expect(parseEventWhen("2026-06-26")).toEqual({
      date: "2026-06-26",
      time: null,
      allDay: true,
    });
  });

  it("treats midnight as unknown time, not a real 12:00 AM", () => {
    expect(parseEventWhen("2026-06-26T00:00:00Z")).toEqual({
      date: "2026-06-26",
      time: null,
      allDay: true,
    });
  });

  it("preserves a real evening time", () => {
    expect(parseEventWhen("2026-06-26T19:30:00Z")).toEqual({
      date: "2026-06-26",
      time: "19:30",
      allDay: false,
    });
  });

  it("returns null for empty or unparseable input", () => {
    expect(parseEventWhen(null)).toBeNull();
    expect(parseEventWhen("")).toBeNull();
    expect(parseEventWhen("not a date")).toBeNull();
  });
});
