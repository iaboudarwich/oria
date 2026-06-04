import { describe, it, expect } from "vitest";
import { sanitizeGroupExtraction } from "@/lib/ai/extract-group";

/**
 * The AI makes the one-vs-many *decision*; these tests pin the deterministic
 * post-processing that guards the DB from a hallucinated response: enum
 * validation, image-index bounds, and the rule that "merged" only holds when
 * exactly one record came back (so a model can never claim a merge while
 * returning several records).
 */
describe("sanitizeGroupExtraction", () => {
  it("keeps a clean single-entity merge (the flight case)", () => {
    const out = sanitizeGroupExtraction(
      {
        merged: true,
        reason: "ticket + boarding pass + flight-number screenshot",
        records: [
          {
            title: "Flight BA245",
            document_type: "ticket",
            section: "travel",
            smart_section: null,
            summary: "London to Cairo",
            confidence: 0.92,
            image_indexes: [0, 1, 2],
          },
        ],
      },
      3,
    );
    expect(out).not.toBeNull();
    expect(out!.merged).toBe(true);
    expect(out!.records).toHaveLength(1);
    expect(out!.records[0].section).toBe("travel");
    expect(out!.records[0].image_indexes).toEqual([0, 1, 2]);
  });

  it("keeps several distinct records (the five-receipts case)", () => {
    const out = sanitizeGroupExtraction(
      {
        merged: false,
        reason: "five unrelated receipts",
        records: [0, 1, 2, 3, 4].map((i) => ({
          title: `Receipt ${i}`,
          document_type: "receipt",
          section: "finance",
          smart_section: "bills",
          confidence: 0.8,
          image_indexes: [i],
        })),
      },
      5,
    );
    expect(out).not.toBeNull();
    expect(out!.merged).toBe(false);
    expect(out!.records).toHaveLength(5);
  });

  it("forces merged=false when the model claims a merge but returns many records", () => {
    const out = sanitizeGroupExtraction(
      {
        merged: true,
        reason: "contradictory",
        records: [
          { title: "A", document_type: "receipt", section: "finance", image_indexes: [0] },
          { title: "B", document_type: "receipt", section: "finance", image_indexes: [1] },
        ],
      },
      2,
    );
    expect(out!.merged).toBe(false);
    expect(out!.records).toHaveLength(2);
  });

  it("coerces hallucinated enums to safe defaults", () => {
    const out = sanitizeGroupExtraction(
      {
        merged: true,
        records: [
          {
            title: "Mystery",
            document_type: "spaceship_manifest",
            section: "atlantis",
            smart_section: "weather",
            confidence: 5,
            image_indexes: [0],
          },
        ],
      },
      1,
    );
    expect(out!.records[0].document_type).toBe("unknown");
    expect(out!.records[0].section).toBeNull();
    expect(out!.records[0].smart_section).toBeNull();
    expect(out!.records[0].confidence).toBe(1); // clamped to [0,1]
  });

  it("drops out-of-range and non-integer image indexes", () => {
    const out = sanitizeGroupExtraction(
      {
        merged: false,
        records: [
          { title: "X", document_type: "photo", section: "personal", image_indexes: [0, 9, -1, 1.5, 2] },
        ],
      },
      3,
    );
    // 9 (>=3) and -1 (<0) dropped, 1.5 (non-integer) dropped; 0 and 2 survive.
    expect(out!.records[0].image_indexes).toEqual([0, 2]);
  });

  it("returns null for an empty or shapeless response (caller falls back per-image)", () => {
    expect(sanitizeGroupExtraction({ merged: true, records: [] }, 2)).toBeNull();
    expect(sanitizeGroupExtraction(null, 2)).toBeNull();
    expect(sanitizeGroupExtraction("nope", 2)).toBeNull();
  });

  it("folds several records into one when the user forced a merge", () => {
    const out = sanitizeGroupExtraction(
      {
        merged: false,
        reason: "model still saw two",
        records: [
          { title: "Low", document_type: "screenshot", section: "travel", confidence: 0.4, image_indexes: [0] },
          { title: "High", document_type: "ticket", section: "travel", confidence: 0.95, image_indexes: [1, 2] },
        ],
      },
      3,
      true, // forceMerge
    );
    expect(out!.merged).toBe(true);
    expect(out!.records).toHaveLength(1);
    // Keeps the highest-confidence record's identity, unions every image.
    expect(out!.records[0].title).toBe("High");
    expect(out!.records[0].image_indexes).toEqual([0, 1, 2]);
  });

  it("supplies a title when the model omits it", () => {
    const out = sanitizeGroupExtraction(
      { merged: true, records: [{ document_type: "receipt", section: "finance", image_indexes: [0] }] },
      1,
    );
    expect(out!.records[0].title).toBe("Untitled");
  });
});
