import { describe, it, expect } from "vitest";
import { buildMemoryItemRows } from "@/lib/data/build-memory-item-rows";
import { normalize, type ExtractedItem } from "@/lib/ai/extract";

/**
 * The pure mapping from extracted items → memory_items rows. The rules
 * asserted here are the ones that keep the product correct AND safe:
 *
 *   • organization scope — the load-bearing multi-tenant invariant
 *   • section routing — bills/receipts forced to Finance, low confidence → Unsorted
 *   • diet date override — meals dated to upload time, not the photo's date
 *   • confidence gating — only confident suggestions are auto-filed
 */

const MODEL = "claude-sonnet-4-6";

/** Build a realistic ExtractedItem via the real normalizer. */
function item(over: Record<string, unknown>): ExtractedItem {
  const raw = {
    title: "Item",
    document_type: "unknown",
    raw_text: "raw",
    entities: { people: [], locations: [], companies: [], amounts: [], dates: [] },
    confidence: 0.9,
    ...over,
  };
  return normalize({ items: [raw] }, MODEL).items[0];
}

describe("buildMemoryItemRows — organization scope", () => {
  it("stamps every row with the upload's organization_id", () => {
    const rows = buildMemoryItemRows({
      items: [
        item({ title: "A", suggested_section: "finance" }),
        item({ title: "B", suggested_section: "travel" }),
        item({ title: "C", smart_section: "diet" }),
      ],
      organizationId: "org-personal-123",
      uploadId: "up-1",
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.organization_id === "org-personal-123")).toBe(true);
  });

  it("never carries one org's id into another upload's rows", () => {
    const a = buildMemoryItemRows({
      items: [item({ title: "A" })],
      organizationId: "org-A",
      uploadId: "up-a",
    });
    const b = buildMemoryItemRows({
      items: [item({ title: "B" })],
      organizationId: "org-B",
      uploadId: "up-b",
    });
    expect(a[0].organization_id).toBe("org-A");
    expect(b[0].organization_id).toBe("org-B");
    expect(a[0].upload_id).toBe("up-a");
    expect(b[0].upload_id).toBe("up-b");
  });
});

describe("buildMemoryItemRows — section routing", () => {
  it("forces a bills item into finance regardless of suggestion", () => {
    const rows = buildMemoryItemRows({
      items: [
        item({
          title: "Vehicle registration renewal",
          document_type: "invoice",
          smart_section: "bills",
          suggested_section: "travel",
          confidence: 0.95,
        }),
      ],
      organizationId: "org",
      uploadId: "up",
    });
    expect(rows[0].section).toBe("finance");
    expect(rows[0].smart_section).toBe("bills");
  });

  it("forces receipts and invoices into finance", () => {
    const rows = buildMemoryItemRows({
      items: [
        item({ title: "R", document_type: "receipt", suggested_section: "household", confidence: 0.95 }),
        item({ title: "I", document_type: "invoice", suggested_section: "personal", confidence: 0.95 }),
      ],
      organizationId: "org",
      uploadId: "up",
    });
    expect(rows.map((r) => r.section)).toEqual(["finance", "finance"]);
  });

  it("honours a confident non-financial suggestion", () => {
    const rows = buildMemoryItemRows({
      items: [item({ title: "Passport", document_type: "scanned_document", suggested_section: "travel", confidence: 0.9 })],
      organizationId: "org",
      uploadId: "up",
    });
    expect(rows[0].section).toBe("travel");
  });

  it("leaves a low-confidence suggestion Unsorted (null section)", () => {
    const rows = buildMemoryItemRows({
      items: [item({ title: "Blurry note", document_type: "photo", suggested_section: "travel", confidence: 0.4 })],
      organizationId: "org",
      uploadId: "up",
    });
    expect(rows[0].section).toBeNull();
  });

  it("applies the smart-section hint when the item itself has none", () => {
    const rows = buildMemoryItemRows({
      items: [item({ title: "Receipt photo", document_type: "photo", confidence: 0.9 })],
      organizationId: "org",
      uploadId: "up",
      smartSectionHint: "bills",
    });
    expect(rows[0].smart_section).toBe("bills");
    expect(rows[0].section).toBe("finance");
  });
});

describe("buildMemoryItemRows — diet date override", () => {
  const NOW = "2026-05-27T12:00:00.000Z";

  it("dates diet items to the upload time, ignoring the photo's date", () => {
    const rows = buildMemoryItemRows({
      items: [
        item({
          title: "Chicken bowl",
          document_type: "photo",
          smart_section: "diet",
          occurred_at: "2024-01-01T00:00:00Z",
          calories: 600,
        }),
      ],
      organizationId: "org",
      uploadId: "up",
      now: NOW,
    });
    expect(rows[0].occurred_at).toBe(NOW);
  });

  it("preserves the extracted due date for bills (no override)", () => {
    const rows = buildMemoryItemRows({
      items: [
        item({
          title: "Electric bill",
          document_type: "invoice",
          smart_section: "bills",
          occurred_at: "2026-03-20T00:00:00Z",
        }),
      ],
      organizationId: "org",
      uploadId: "up",
      now: NOW,
    });
    expect(rows[0].occurred_at).toBe("2026-03-20T00:00:00Z");
  });
});

describe("buildMemoryItemRows — passthrough fields", () => {
  it("carries amounts, currency, macros, and recurrence onto the row", () => {
    const rows = buildMemoryItemRows({
      items: [
        item({
          title: "Électricité",
          document_type: "invoice",
          merchant: "EDL",
          amount_value: "85.00",
          amount_currency: "USD",
          amount_normalized: 85,
          direction: "outflow",
          is_recurring: true,
          recurring_interval: "monthly",
          smart_section: "bills",
        }),
      ],
      organizationId: "org",
      uploadId: "up",
    });
    expect(rows[0]).toMatchObject({
      merchant: "EDL",
      amount_value: "85.00",
      amount_currency: "USD",
      amount_normalized: 85,
      direction: "outflow",
      is_recurring: true,
      recurring_interval: "monthly",
    });
  });

  it("includes the user description in facts only when provided", () => {
    const withNote = buildMemoryItemRows({
      items: [item({ title: "A" })],
      organizationId: "org",
      uploadId: "up",
      userDescription: "Lunch at the office",
    });
    const withoutNote = buildMemoryItemRows({
      items: [item({ title: "A" })],
      organizationId: "org",
      uploadId: "up",
    });
    expect(withNote[0].facts.user_description).toBe("Lunch at the office");
    expect("user_description" in withoutNote[0].facts).toBe(false);
  });
});
