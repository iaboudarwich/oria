import { describe, it, expect } from "vitest";
import { shortLabel } from "@/components/calendar/calendar-shared";
import type { CalendarEntry } from "@/lib/data/calendar-types";

/**
 * Build a minimal CalendarEntry. shortLabel only reads `title`, so we
 * stub the rest with safe defaults that match the type signature.
 */
function entry(title: string): CalendarEntry {
  return {
    id: "test",
    kind: "item",
    title,
    due_at: "2026-06-01T00:00:00Z",
    done: null,
    source: null,
    confirmed_at: null,
    upload_id: null,
    space_id: "x",
    space_name: "Test",
    space_kind: "personal",
    category: "reminders",
    topic: "reminder",
    meta: null,
  };
}

describe("shortLabel — calendar day cell text", () => {
  describe("flight legs (Unicode arrow or en-dash only)", () => {
    it("collapses 'Boston → Paris, 05 Jul 2026 (AF 331)' to BOS → PAR", () => {
      expect(shortLabel(entry("Boston → Paris, 05 Jul 2026 (AF 331)"))).toBe(
        "BOS → PAR",
      );
    });

    it("en-dash also signals a route", () => {
      // The Itinerary extractor uses → in practice; en-dash is
      // accepted as a fallback for old data.
      expect(shortLabel(entry("Boston – Paris (AF 331)"))).toBe("BOS → PAR");
    });

    it("em-dash is NOT a route separator — title is just trimmed", () => {
      // Em-dash is sentence punctuation, not a route arrow. The
      // shortLabel falls through to the head-split path.
      expect(shortLabel(entry("Paris — Beirut (AF 5106)"))).toBe("Paris");
    });

    it("internal hyphens in compound words don't trigger arrow rule", () => {
      // Regression guard: "Pay Catalina Landing — 2026 Full-Year
      // Budget" used to collapse to "FUL → YEA" because the regex
      // caught the hyphen in "Full-Year". Now it routes through the
      // Pay rule correctly.
      expect(
        shortLabel(entry("Pay Catalina Landing — 2026 Full-Year Budget")),
      ).toBe("Catalina Landing due");
    });
  });

  describe("bill payments", () => {
    it("'Pay AICO Abdallah Itani' → 'AICO Abdallah due'", () => {
      expect(shortLabel(entry("Pay AICO Abdallah Itani"))).toBe(
        "AICO Abdallah due",
      );
    });

    it("'Pay BofA' single-word vendor still produces a label", () => {
      expect(shortLabel(entry("Pay BofA"))).toBe("BofA due");
    });
  });

  describe("contracts / leases / generic items", () => {
    it("titles longer than 22 chars truncate with ellipsis", () => {
      // "Lease expires August 30" is 23 chars → trims with "…" to fit
      // the day-cell width budget at sm+ (~78px).
      const got = shortLabel(entry("Lease expires August 30"));
      expect(got).toBe("Lease expires August …");
    });

    it("short titles pass through untouched", () => {
      expect(shortLabel(entry("Rent due"))).toBe("Rent due");
    });

    it("long titles truncate to 22 chars with ellipsis", () => {
      const long = "Some extremely long item title that won't fit anywhere";
      const got = shortLabel(entry(long));
      expect(got.length).toBeLessThanOrEqual(22);
      expect(got).toMatch(/…$/);
    });

    it("title with em-dash uses the head", () => {
      expect(
        shortLabel(entry("Invoice due — Acme — $4,200")),
      ).toBe("Invoice due");
    });
  });

  describe("edge cases", () => {
    it("empty title returns empty string", () => {
      expect(shortLabel(entry(""))).toBe("");
    });

    it("whitespace-only title returns empty string", () => {
      expect(shortLabel(entry("   "))).toBe("");
    });
  });
});
