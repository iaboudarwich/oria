import { describe, it, expect } from "vitest";
import { resolveFinalSection } from "@/lib/data/section-routing";

describe("resolveFinalSection", () => {
  describe("bills/invoices always land in Finance", () => {
    it("smart_section=bills overrides model suggestion of travel", () => {
      // The real bug that motivated this helper: a vehicle registration
      // renewal invoice that the model suggested for travel because cars
      // are travel-shaped. It's a bill, so Finance wins.
      const out = resolveFinalSection({
        suggested: "travel",
        documentType: "invoice",
        smartSection: "bills",
        sectionHint: null,
      });
      expect(out).toBe("finance");
    });

    it("document_type=invoice overrides health suggestion", () => {
      const out = resolveFinalSection({
        suggested: "health",
        documentType: "invoice",
        smartSection: null,
        sectionHint: null,
      });
      expect(out).toBe("finance");
    });

    it("document_type=receipt overrides personal suggestion", () => {
      const out = resolveFinalSection({
        suggested: "personal",
        documentType: "receipt",
        smartSection: null,
        sectionHint: null,
      });
      expect(out).toBe("finance");
    });
  });

  describe("when no override applies, honors model > caller hint > null", () => {
    it("uses the model's suggestion when present", () => {
      const out = resolveFinalSection({
        suggested: "travel",
        documentType: "boarding_pass",
        smartSection: null,
        sectionHint: null,
      });
      expect(out).toBe("travel");
    });

    it("falls back to caller hint when model didn't suggest", () => {
      const out = resolveFinalSection({
        suggested: null,
        documentType: "photo",
        smartSection: null,
        sectionHint: "events",
      });
      expect(out).toBe("events");
    });

    it("returns null when nothing applies (item goes to Unsorted)", () => {
      // Low-confidence items pass suggested=null from the caller; with
      // no override and no hint, the item lands in Unsorted/Review.
      const out = resolveFinalSection({
        suggested: null,
        documentType: "unknown",
        smartSection: null,
        sectionHint: null,
      });
      expect(out).toBeNull();
    });
  });

  describe("smart_section=diet doesn't force into Finance", () => {
    // Diet is a smart section but isn't a money-shaped doc — it stays
    // in whatever section the model suggested (or personal by default).
    it("diet + photo + personal suggestion → personal", () => {
      const out = resolveFinalSection({
        suggested: "personal",
        documentType: "photo",
        smartSection: "diet",
        sectionHint: null,
      });
      expect(out).toBe("personal");
    });
  });
});
