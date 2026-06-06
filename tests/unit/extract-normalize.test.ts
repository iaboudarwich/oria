import { describe, it, expect } from "vitest";
import { normalize, type ExtractedItem } from "@/lib/ai/extract";

/**
 * Extraction normalization — the deterministic seam between Claude's
 * tool-use output and the structured records Oria stores and answers
 * questions from. These fixtures stand in for `store_extraction` tool
 * payloads (the exact `toolUse.input` shape extract.ts forwards to
 * normalize), so we lock down the parsing contract WITHOUT calling Claude.
 *
 * A drift here is silent and expensive: a mis-read currency, a dropped
 * date, or an invented section quietly corrupts "what did I spend in
 * April" months later. The assertions below cover the document types
 * that carry money + dates: receipts, meals, flights, invoices, leases,
 * and recurring expenses.
 */

const MODEL = "claude-sonnet-4-6";

/** A complete, valid raw item — override per fixture. */
function rawItem(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Untitled",
    document_type: "unknown",
    language: "en",
    secondary_languages: [],
    is_handwritten: false,
    raw_text: "raw",
    summary: null,
    merchant: null,
    amount_value: null,
    amount_currency: null,
    amount_normalized: null,
    occurred_at: null,
    location: null,
    payment_method: null,
    category: null,
    items_purchased: [],
    smart_section: null,
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
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
    suggested_section: null,
    confidence: 0.9,
    ...over,
  };
}

function one(over: Record<string, unknown>): ExtractedItem {
  const result = normalize({ items: [rawItem(over)] }, MODEL);
  expect(result.items).toHaveLength(1);
  return result.items[0];
}

describe("normalize — envelope", () => {
  it("stamps the processor with the model id", () => {
    const result = normalize({ items: [rawItem()] }, MODEL);
    expect(result.processor).toBe(`claude:${MODEL}`);
  });

  it("keeps source_quality_notes when present, null otherwise", () => {
    expect(normalize({ items: [rawItem()] }, MODEL).source_quality_notes).toBeNull();
    expect(
      normalize({ source_quality_notes: "blurry, tilted", items: [rawItem()] }, MODEL)
        .source_quality_notes,
    ).toBe("blurry, tilted");
  });

  it("returns an empty item list (not a throw) when items is missing", () => {
    expect(normalize({}, MODEL).items).toEqual([]);
    expect(normalize({ items: "not-an-array" }, MODEL).items).toEqual([]);
  });

  it("preserves one item per receipt for multi-receipt photos", () => {
    const result = normalize(
      {
        items: [
          rawItem({ title: "Spinneys — 47.20 USD", merchant: "Spinneys" }),
          rawItem({ title: "Pharmacy — 12.00 USD", merchant: "Pharmacy" }),
          rawItem({ title: "Cafe — 5.50 USD", merchant: "Cafe" }),
        ],
      },
      MODEL,
    );
    expect(result.items.map((i) => i.merchant)).toEqual(["Spinneys", "Pharmacy", "Cafe"]);
  });
});

describe("normalize — receipt (grocery purchase)", () => {
  const item = one({
    title: "Spinneys, Feb 12 — 47.20 USD",
    document_type: "receipt",
    merchant: "Spinneys",
    amount_value: "47.20",
    amount_currency: "USD",
    amount_normalized: 47.2,
    occurred_at: "2026-02-12T14:30:00Z",
    location: "Beirut",
    payment_method: "Visa",
    category: "groceries",
    items_purchased: ["Milk", "Bread", "Eggs"],
    direction: "outflow",
    suggested_section: "finance",
    confidence: 0.92,
  });

  it("keeps the amount, currency, and numeric normalization", () => {
    expect(item.amount_value).toBe("47.20");
    expect(item.amount_currency).toBe("USD");
    expect(item.amount_normalized).toBe(47.2);
  });
  it("keeps the transaction date and merchant", () => {
    expect(item.occurred_at).toBe("2026-02-12T14:30:00Z");
    expect(item.merchant).toBe("Spinneys");
  });
  it("classifies a purchase as an outflow filed to finance", () => {
    expect(item.direction).toBe("outflow");
    expect(item.suggested_section).toBe("finance");
    expect(item.document_type).toBe("receipt");
  });
  it("keeps line items", () => {
    expect(item.items_purchased).toEqual(["Milk", "Bread", "Eggs"]);
  });
});

describe("normalize — meal (diet smart section)", () => {
  const item = one({
    title: "Chicken bowl with rice and salad",
    document_type: "photo",
    smart_section: "diet",
    calories: 600,
    protein_g: 45,
    carbs_g: 70,
    fat_g: 18,
    occurred_at: null,
    category: "lunch",
    confidence: 0.7,
  });

  it("routes to the diet smart section", () => {
    expect(item.smart_section).toBe("diet");
  });
  it("carries macro estimates as numbers", () => {
    expect(item.calories).toBe(600);
    expect(item.protein_g).toBe(45);
    expect(item.carbs_g).toBe(70);
    expect(item.fat_g).toBe(18);
  });
  it("leaves occurred_at null (the pipeline stamps meal time downstream)", () => {
    expect(item.occurred_at).toBeNull();
  });
});

describe("normalize — flight legs (travel events)", () => {
  const result = normalize(
    {
      items: [
        rawItem({
          title: "BEY → CDG, Mar 3",
          document_type: "boarding_pass",
          merchant: "Air France",
          occurred_at: "2026-03-03T09:15:00Z",
          location: "Beirut",
          suggested_section: "travel",
          confidence: 0.95,
        }),
        rawItem({
          title: "CDG → BEY, Mar 10",
          document_type: "boarding_pass",
          merchant: "Air France",
          occurred_at: "2026-03-10T18:40:00Z",
          location: "Paris",
          suggested_section: "travel",
          confidence: 0.95,
        }),
      ],
    },
    MODEL,
  );

  it("keeps one item per leg with the departure datetime", () => {
    expect(result.items).toHaveLength(2);
    expect(result.items[0].occurred_at).toBe("2026-03-03T09:15:00Z");
    expect(result.items[1].occurred_at).toBe("2026-03-10T18:40:00Z");
  });
  it("files flights to travel with the carrier as merchant", () => {
    expect(result.items.every((i) => i.suggested_section === "travel")).toBe(true);
    expect(result.items.every((i) => i.merchant === "Air France")).toBe(true);
  });
});

describe("normalize — sales invoice (inflow)", () => {
  const item = one({
    title: "Invoice #1099 — Acme Corp",
    document_type: "invoice",
    merchant: "Acme Corp",
    amount_value: "1,250.00",
    amount_currency: "EUR",
    amount_normalized: 1250,
    occurred_at: "2026-04-01T00:00:00Z",
    direction: "inflow",
    suggested_section: "finance",
    confidence: 0.9,
    entities: {
      people: ["Jane Roe"],
      locations: [],
      companies: ["Acme Corp"],
      amounts: [{ value: "1,250.00", currency: "EUR", context: "total due" }],
      dates: [{ value: "Apr 1 2026", iso: "2026-04-01", context: "issue date" }],
    },
  });

  it("preserves punctuation in amount_value but normalizes the number", () => {
    expect(item.amount_value).toBe("1,250.00");
    expect(item.amount_normalized).toBe(1250);
    expect(item.amount_currency).toBe("EUR");
  });
  it("marks a customer invoice as an inflow", () => {
    expect(item.direction).toBe("inflow");
    expect(item.document_type).toBe("invoice");
  });
  it("retains structured entities (companies, amounts, dates)", () => {
    expect(item.entities.companies).toContain("Acme Corp");
    expect(item.entities.amounts[0]).toMatchObject({
      value: "1,250.00",
      currency: "EUR",
    });
    expect(item.entities.dates[0]).toMatchObject({ iso: "2026-04-01" });
  });
});

describe("normalize — lease (occurred_at is the expiration)", () => {
  const item = one({
    title: "Apartment lease — 12 Rue Foch",
    document_type: "contract",
    occurred_at: "2027-01-01T00:00:00Z",
    location: "Beirut",
    suggested_section: "legal",
    direction: null,
    confidence: 0.8,
    entities: {
      people: ["Issam A.", "Landlord SARL"],
      locations: ["12 Rue Foch"],
      companies: ["Landlord SARL"],
      amounts: [{ value: "1,000", currency: "USD", context: "monthly rent" }],
      dates: [{ value: "Jan 1 2026", iso: "2026-01-01", context: "signing" }],
    },
  });

  it("keeps the expiration as occurred_at, signing date in entities", () => {
    expect(item.occurred_at).toBe("2027-01-01T00:00:00Z");
    expect(item.entities.dates[0]).toMatchObject({
      iso: "2026-01-01",
      context: "signing",
    });
  });
  it("files to legal with no money direction", () => {
    expect(item.suggested_section).toBe("legal");
    expect(item.direction).toBeNull();
  });
});

describe("normalize — recurring expense (bills smart section)", () => {
  const item = one({
    title: "Électricité — March",
    document_type: "invoice",
    merchant: "EDL",
    amount_value: "85.00",
    amount_currency: "USD",
    amount_normalized: 85,
    occurred_at: "2026-03-20T00:00:00Z",
    direction: "outflow",
    smart_section: "bills",
    is_recurring: true,
    recurring_interval: "monthly",
    suggested_section: "finance",
    confidence: 0.88,
  });

  it("routes to the bills smart section as a recurring outflow", () => {
    expect(item.smart_section).toBe("bills");
    expect(item.direction).toBe("outflow");
    expect(item.is_recurring).toBe(true);
    expect(item.recurring_interval).toBe("monthly");
  });
  it("uses the due date as occurred_at", () => {
    expect(item.occurred_at).toBe("2026-03-20T00:00:00Z");
  });
});

describe("normalize — defensive parsing of bad model output", () => {
  it("drops items with no usable title", () => {
    const result = normalize(
      { items: [rawItem({ title: "" }), rawItem({ title: "   " }), { merchant: "X" }] },
      MODEL,
    );
    expect(result.items).toEqual([]);
  });

  it("falls back to 'unknown' for an out-of-enum document_type", () => {
    expect(one({ title: "X", document_type: "spaceship" }).document_type).toBe("unknown");
  });

  it("rejects an out-of-enum suggested_section (→ null)", () => {
    expect(one({ title: "X", suggested_section: "outer_space" }).suggested_section).toBeNull();
  });

  it("clamps an out-of-range confidence to 0", () => {
    expect(one({ title: "X", confidence: 9 }).confidence).toBe(0);
    expect(one({ title: "X", confidence: -1 }).confidence).toBe(0);
    expect(one({ title: "X", confidence: "high" }).confidence).toBe(0);
  });

  it("nulls a non-enum smart_section and direction", () => {
    const item = one({ title: "X", smart_section: "fitness", direction: "sideways" });
    expect(item.smart_section).toBeNull();
    expect(item.direction).toBeNull();
  });

  it("drops a non-numeric amount_normalized but keeps the written value", () => {
    const item = one({
      title: "X",
      amount_value: "47.20",
      amount_normalized: "47.20",
    });
    expect(item.amount_value).toBe("47.20");
    expect(item.amount_normalized).toBeNull();
  });

  it("filters non-string members out of array fields", () => {
    const item = one({
      title: "X",
      items_purchased: ["Milk", 5, null, "Bread"],
      secondary_languages: ["fr", 7],
    });
    expect(item.items_purchased).toEqual(["Milk", "Bread"]);
    expect(item.secondary_languages).toEqual(["fr"]);
  });

  it("drops entity amounts/dates that lack a string value", () => {
    const item = one({
      title: "X",
      entities: {
        people: ["A", 3],
        locations: [],
        companies: [],
        amounts: [{ currency: "USD" }, { value: "10", currency: "USD" }],
        dates: [{ context: "no value" }, { value: "Jan 1", iso: "2026-01-01" }],
      },
    });
    expect(item.entities.people).toEqual(["A"]);
    expect(item.entities.amounts).toEqual([{ value: "10", currency: "USD" }]);
    expect(item.entities.dates).toEqual([{ value: "Jan 1", iso: "2026-01-01" }]);
  });

  it("returns empty entities when the entities object is malformed", () => {
    const item = one({ title: "X", entities: "nope" });
    expect(item.entities).toEqual({
      people: [],
      locations: [],
      companies: [],
      amounts: [],
      dates: [],
    });
  });
});
