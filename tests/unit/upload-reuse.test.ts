import { describe, it, expect, afterEach, vi } from "vitest";
import {
  contentHashHex,
  markProcessorReused,
  remapRowsToUpload,
  MEMORY_ITEM_CLONE_COLUMNS,
  EXTRACTION_CLONE_COLUMNS,
} from "@/lib/data/upload-reuse";
import { getExtractionModel, getTextExtractionModel } from "@/lib/ai/extract";

/**
 * Identical-content upload reuse — pure helpers.
 *
 * Reuse is the largest AI-cost saver in the upload path: when the exact
 * same bytes are uploaded twice, we clone the prior extraction's
 * structured records instead of paying Claude again. These tests pin down
 * the bits of that path that have to be unforgiving:
 *   • content_hash is stable, collision-resistant, byte-driven (not name-)
 *   • row remap re-stamps upload_id WITHOUT touching organization_id,
 *     so the org-scope invariant survives the clone
 *   • processor provenance is tagged so a reused row is auditable
 *   • the column allowlists match what the extraction path actually writes
 *   • task-based model routing defaults to the cheap model for quick-logs
 *     and the strong model for file extraction
 */

describe("contentHashHex", () => {
  it("returns a 64-char lowercase hex sha256", () => {
    const h = contentHashHex(Buffer.from("hello world"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    // Known sha256 of "hello world".
    expect(h).toBe("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
  });

  it("is deterministic for identical bytes", () => {
    const a = contentHashHex(Buffer.from([1, 2, 3, 4, 5]));
    const b = contentHashHex(Buffer.from([1, 2, 3, 4, 5]));
    expect(a).toBe(b);
  });

  it("changes when even one byte differs", () => {
    const a = contentHashHex(Buffer.from([1, 2, 3, 4, 5]));
    const b = contentHashHex(Buffer.from([1, 2, 3, 4, 6]));
    expect(a).not.toBe(b);
  });

  it("accepts Uint8Array and matches the equivalent Buffer", () => {
    const arr = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const buf = Buffer.from(arr);
    expect(contentHashHex(arr)).toBe(contentHashHex(buf));
  });
});

describe("remapRowsToUpload", () => {
  const sourceRows = [
    {
      upload_id: "twin-upload",
      organization_id: "org-A",
      title: "Spinneys",
      amount_value: "47.20",
      smart_section: null,
    },
    {
      upload_id: "twin-upload",
      organization_id: "org-A",
      title: "Pharmacy",
      amount_value: "12.00",
      smart_section: null,
    },
  ];

  it("re-stamps upload_id on every row", () => {
    const out = remapRowsToUpload(sourceRows, "new-upload");
    expect(out.map((r) => r.upload_id)).toEqual(["new-upload", "new-upload"]);
  });

  it("preserves organization_id on every row (scope-isolation invariant)", () => {
    const out = remapRowsToUpload(sourceRows, "new-upload");
    expect(out.every((r) => r.organization_id === "org-A")).toBe(true);
  });

  it("preserves every other field unchanged", () => {
    const out = remapRowsToUpload(sourceRows, "new-upload");
    expect(out[0]).toMatchObject({
      title: "Spinneys",
      amount_value: "47.20",
      smart_section: null,
    });
    expect(out[1]).toMatchObject({
      title: "Pharmacy",
      amount_value: "12.00",
    });
  });

  it("does not mutate the input rows", () => {
    const before = JSON.stringify(sourceRows);
    remapRowsToUpload(sourceRows, "new-upload");
    expect(JSON.stringify(sourceRows)).toBe(before);
  });

  it("returns an empty array for an empty input", () => {
    expect(remapRowsToUpload([], "new-upload")).toEqual([]);
  });
});

describe("markProcessorReused", () => {
  it("appends +reused to a real processor string", () => {
    expect(markProcessorReused("claude:claude-sonnet-4-6")).toBe("claude:claude-sonnet-4-6+reused");
  });

  it("is idempotent — doesn't double-suffix", () => {
    const once = markProcessorReused("claude:claude-sonnet-4-6");
    const twice = markProcessorReused(once);
    expect(twice).toBe(once);
  });

  it("falls back to 'unknown+reused' for null / non-string input", () => {
    expect(markProcessorReused(null)).toBe("unknown+reused");
    expect(markProcessorReused(undefined)).toBe("unknown+reused");
    expect(markProcessorReused("")).toBe("unknown+reused");
    expect(markProcessorReused(42)).toBe("unknown+reused");
  });
});

describe("clone column allowlists", () => {
  // The reuse path SELECTs by these column lists and INSERTs the result.
  // A drift between the allowlist and the table schema would silently
  // drop fields from cloned rows, so we pin the must-have columns.
  it("memory_items clone columns carry org scope + upload + every structured field", () => {
    const cols = new Set<string>(MEMORY_ITEM_CLONE_COLUMNS);
    for (const required of [
      "organization_id",
      "upload_id",
      "document_type",
      "section",
      "title",
      "merchant",
      "amount_value",
      "amount_currency",
      "amount_normalized",
      "occurred_at",
      "raw_text",
      "entities",
      "facts",
      "calories",
      "protein_g",
      "carbs_g",
      "fat_g",
      "is_recurring",
      "recurring_interval",
      "direction",
      "smart_section",
    ]) {
      expect(cols.has(required)).toBe(true);
    }
  });

  it("extraction clone columns include upload_id + raw_text + entities + processor", () => {
    const cols = new Set<string>(EXTRACTION_CLONE_COLUMNS);
    for (const required of [
      "upload_id",
      "raw_text",
      "entities",
      "action_items",
      "confidence",
      "processor",
      "document_type",
    ]) {
      expect(cols.has(required)).toBe(true);
    }
  });
});

describe("task-based model routing", () => {
  // Vitest stubs env so a test mutation doesn't bleed into the process.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("file extraction defaults to the strong model (sonnet)", () => {
    vi.stubEnv("ANTHROPIC_EXTRACTION_MODEL", "");
    vi.stubEnv("ANTHROPIC_MODEL", "");
    expect(getExtractionModel()).toBe("claude-sonnet-4-6");
  });

  it("typed quick-logs default to the cheap model (haiku 4.5)", () => {
    vi.stubEnv("ORIA_TEXT_EXTRACTION_MODEL", "");
    vi.stubEnv("ANTHROPIC_MODEL", "");
    expect(getTextExtractionModel()).toBe("claude-haiku-4-5-20251001");
  });

  it("text-extraction model is dedicated — ORIA_TEXT_EXTRACTION_MODEL overrides", () => {
    vi.stubEnv("ORIA_TEXT_EXTRACTION_MODEL", "claude-test-cheap-1");
    expect(getTextExtractionModel()).toBe("claude-test-cheap-1");
  });

  it("ANTHROPIC_MODEL is honoured as the shared fallback when no dedicated var is set", () => {
    vi.stubEnv("ORIA_TEXT_EXTRACTION_MODEL", "");
    vi.stubEnv("ANTHROPIC_MODEL", "claude-shared-x");
    expect(getTextExtractionModel()).toBe("claude-shared-x");
  });
});
