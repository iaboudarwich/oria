import { describe, it, expect } from "vitest";
import { normalize } from "@/lib/ai/extract";

/**
 * The text/typed-record path looks like:
 *   user types → Claude → tool_use JSON → normalize() → memory_items
 *
 * We can't unit-test the Claude call, but normalize() is pure: it
 * takes the raw tool_use input and returns a typed ExtractedItem[].
 * Test that the canonical examples from the product spec round-trip
 * into the expected record shapes.
 */
describe("normalize — typed text becomes structured records", () => {
  it("'I spent 500 USD at Chanel yesterday' → expense record", () => {
    // Synthetic tool_use payload — exactly what the model would
    // produce for this input given the EXTRACTION_TOOL schema.
    const raw = {
      source_quality_notes: null,
      items: [
        {
          title: "Chanel Purchase — $500",
          document_type: "receipt",
          language: "en",
          secondary_languages: [],
          is_handwritten: false,
          raw_text: "I spent 500 USD at Chanel yesterday",
          summary: "Spent $500 at Chanel (luxury shopping).",
          merchant: "Chanel",
          amount_value: "500",
          amount_currency: "USD",
          amount_normalized: 500,
          occurred_at: "2026-05-26T19:00:00.000Z", // model resolves "yesterday"
          location: null,
          payment_method: null,
          category: "luxury shopping",
          items_purchased: [],
          smart_section: null,
          calories: null,
          protein_g: null,
          carbs_g: null,
          fat_g: null,
          is_recurring: null,
          recurring_interval: null,
          direction: "outflow",
          entities: {
            people: [],
            locations: [],
            companies: ["Chanel"],
            amounts: [{ value: "500", currency: "USD", context: "purchase" }],
            dates: [{ value: "yesterday", iso: "2026-05-26", context: "purchase date" }],
          },
          action_items: [],
          suggested_section: "finance",
          confidence: 0.95,
        },
      ],
    };

    const out = normalize(raw, "claude-sonnet-4-6");
    expect(out.items).toHaveLength(1);
    const item = out.items[0];
    expect(item.merchant).toBe("Chanel");
    expect(item.amount_value).toBe("500");
    expect(item.amount_currency).toBe("USD");
    expect(item.amount_normalized).toBe(500);
    expect(item.direction).toBe("outflow");
    expect(item.suggested_section).toBe("finance");
    expect(item.document_type).toBe("receipt");
    expect(item.confidence).toBeGreaterThan(0.9);
  });

  it("'I ate pasta and eggs' → meal record with macros", () => {
    const raw = {
      source_quality_notes: null,
      items: [
        {
          title: "Pasta with eggs",
          document_type: "photo", // diet items come back tagged as photo
          language: "en",
          secondary_languages: [],
          is_handwritten: false,
          raw_text: "I ate pasta and eggs",
          summary: "Plate of pasta with eggs.",
          merchant: null,
          amount_value: null,
          amount_currency: null,
          amount_normalized: null,
          occurred_at: null, // downstream forces upload time for diet
          location: null,
          payment_method: null,
          category: "home meal",
          items_purchased: [],
          smart_section: "diet",
          calories: 580,
          protein_g: 24,
          carbs_g: 78,
          fat_g: 18,
          is_recurring: null,
          recurring_interval: null,
          direction: null,
          entities: {
            people: [],
            locations: [],
            companies: [],
            amounts: [],
            dates: [],
          },
          action_items: [],
          suggested_section: "personal",
          confidence: 0.88,
        },
      ],
    };

    const out = normalize(raw, "claude-sonnet-4-6");
    expect(out.items).toHaveLength(1);
    const item = out.items[0];
    expect(item.smart_section).toBe("diet");
    expect(item.calories).toBe(580);
    expect(item.protein_g).toBe(24);
    expect(item.carbs_g).toBe(78);
    expect(item.fat_g).toBe(18);
    expect(item.merchant).toBeNull();
    expect(item.direction).toBeNull();
  });

  describe("defensive normalization", () => {
    it("drops items without a title", () => {
      const raw = {
        items: [
          { title: "", confidence: 0.9 },
          { title: "ok", document_type: "receipt", entities: {}, confidence: 0.9 },
        ],
      };
      const out = normalize(raw, "m");
      expect(out.items).toHaveLength(1);
      expect(out.items[0].title).toBe("ok");
    });

    it("clamps invalid document_type to 'unknown'", () => {
      const raw = {
        items: [
          {
            title: "Something",
            document_type: "lemon", // not in the enum
            confidence: 0.9,
          },
        ],
      };
      const out = normalize(raw, "m");
      expect(out.items[0].document_type).toBe("unknown");
    });

    it("rejects invalid suggested_section, leaving null", () => {
      const raw = {
        items: [
          {
            title: "Something",
            suggested_section: "not-a-real-section",
            confidence: 0.9,
          },
        ],
      };
      const out = normalize(raw, "m");
      expect(out.items[0].suggested_section).toBeNull();
    });

    it("returns empty items array when input has no items", () => {
      const out = normalize({ items: [] }, "m");
      expect(out.items).toEqual([]);
    });

    it("survives entirely missing optional fields", () => {
      const raw = { items: [{ title: "Bare" }] };
      const out = normalize(raw, "m");
      expect(out.items).toHaveLength(1);
      expect(out.items[0].merchant).toBeNull();
      expect(out.items[0].calories).toBeNull();
      expect(out.items[0].confidence).toBe(0);
    });
  });
});
