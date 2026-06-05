import { describe, it, expect } from "vitest";
import { filterSavedView, savedViewCounts, type ViewItem } from "@/lib/views/saved-views";

// Fixed "now" = 2026-06-05 14:00 UTC. Use UTC tz so local day = UTC day.
const NOW = "2026-06-05T14:00:00Z";
const TZ = "UTC";

const items: ViewItem[] = [
  { id: "today1", whenISO: "2026-06-05T16:00:00Z" },
  { id: "today_done", whenISO: "2026-06-05T09:00:00Z", done: true },
  { id: "yesterday", whenISO: "2026-06-04T10:00:00Z" }, // overdue
  { id: "in3days", whenISO: "2026-06-08T10:00:00Z" }, // this week
  { id: "in10days", whenISO: "2026-06-15T10:00:00Z" }, // beyond week
  { id: "flagged1", whenISO: null, flagged: true },
];

describe("filterSavedView", () => {
  it("today: dated to the local today, excludes done", () => {
    const r = filterSavedView(items, "today", NOW, TZ).map((i) => i.id);
    expect(r).toEqual(["today1"]);
  });

  it("overdue: dated before today and not done", () => {
    const r = filterSavedView(items, "overdue", NOW, TZ).map((i) => i.id);
    expect(r).toEqual(["yesterday"]);
  });

  it("this_week: today through the next 6 days inclusive", () => {
    const r = filterSavedView(items, "this_week", NOW, TZ).map((i) => i.id);
    expect(r).toEqual(["today1", "in3days"]);
    expect(r).not.toContain("in10days");
  });

  it("flagged: only flagged, regardless of date or done", () => {
    const r = filterSavedView(items, "flagged", NOW, TZ).map((i) => i.id);
    expect(r).toEqual(["flagged1"]);
  });

  it("all: everything, unfiltered", () => {
    expect(filterSavedView(items, "all", NOW, TZ).length).toBe(items.length);
  });

  it("counts each view", () => {
    const c = savedViewCounts(items, NOW, TZ);
    expect(c.today).toBe(1);
    expect(c.overdue).toBe(1);
    expect(c.this_week).toBe(2);
    expect(c.flagged).toBe(1);
    expect(c.all).toBe(items.length);
  });
});
