import { describe, it, expect } from "vitest";
import { splitIntoChunksWithMeta } from "@/lib/extraction/chunk";

describe("splitIntoChunksWithMeta — segment-aware chunking", () => {
  it("tags chunks with sheet name + index for multi-tab spreadsheets", () => {
    const text =
      `## Sheet: Budget Variance\n\n${"budget row ".repeat(40)}\n\n` +
      `## Sheet: Expenses\n\n${"expense row ".repeat(40)}`;
    const chunks = splitIntoChunksWithMeta(text);

    const budget = chunks.find((c) => c.meta.sheet_name === "Budget Variance");
    const expenses = chunks.find((c) => c.meta.sheet_name === "Expenses");
    expect(budget).toBeTruthy();
    expect(expenses).toBeTruthy();
    expect(budget?.meta.sheet_index).toBe(0);
    expect(expenses?.meta.sheet_index).toBe(1);
  });

  it("tags chunks with page_number for multi-page PDFs", () => {
    const text =
      `## Page 1\n\n${"page one text ".repeat(40)}\n\n` +
      `## Page 2\n\n${"page two text ".repeat(40)}`;
    const chunks = splitIntoChunksWithMeta(text);
    expect(chunks.some((c) => c.meta.page_number === 1)).toBe(true);
    expect(chunks.some((c) => c.meta.page_number === 2)).toBe(true);
  });

  it("returns empty meta when there are no segment markers", () => {
    const chunks = splitIntoChunksWithMeta("just some plain text ".repeat(40));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => Object.keys(c.meta).length === 0)).toBe(true);
  });
});
