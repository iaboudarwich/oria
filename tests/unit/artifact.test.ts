import { describe, it, expect } from "vitest";
import { shouldAttemptArtifact, sanitizeArtifact } from "@/lib/ai/artifact";

describe("shouldAttemptArtifact", () => {
  it("skips short one-line answers", () => {
    expect(shouldAttemptArtifact("when is my flight", "Tomorrow at 6am.")).toBe(false);
  });

  it("fires on a roll-up question with numbers", () => {
    const answer = "You spent 763 dollars across 4 receipts. The biggest was Hermes at 419.";
    expect(shouldAttemptArtifact("how much did I spend this week", answer)).toBe(true);
  });

  it("fires when the user asks for a breakdown or list", () => {
    expect(
      shouldAttemptArtifact(
        "give me a breakdown by category",
        "Groceries were a big chunk of it this month.",
      ),
    ).toBe(true);
  });

  it("fires on several numeric lines", () => {
    const answer = "Rent is 2500. Electricity is 120. Internet is 60. Phone is 45.";
    expect(shouldAttemptArtifact("list my bills", answer)).toBe(true);
  });
});

describe("sanitizeArtifact", () => {
  it("returns null for none/garbage", () => {
    expect(sanitizeArtifact({ type: "none" })).toBeNull();
    expect(sanitizeArtifact(null)).toBeNull();
    expect(sanitizeArtifact("nope")).toBeNull();
  });

  it("accepts a stat card", () => {
    const a = sanitizeArtifact({
      type: "stat_card",
      label: "Total",
      value: "$763",
      sublabel: "4 receipts",
    });
    expect(a).toEqual({ type: "stat_card", label: "Total", value: "$763", sublabel: "4 receipts" });
  });

  it("coerces chart point values and drops bad points", () => {
    const a = sanitizeArtifact({
      type: "chart",
      chartKind: "bar",
      points: [
        { label: "Jan", value: "1,200" },
        { label: "Feb", value: 800 },
        { label: "", value: 5 },
        { label: "Mar", value: "x" },
      ],
    });
    expect(a).toEqual({
      type: "chart",
      chartKind: "bar",
      points: [
        { label: "Jan", value: 1200 },
        { label: "Feb", value: 800 },
      ],
      caption: null,
    });
  });

  it("requires a chart to have at least two points", () => {
    expect(
      sanitizeArtifact({ type: "chart", chartKind: "line", points: [{ label: "Jan", value: 1 }] }),
    ).toBeNull();
  });

  it("keeps only rows matching the column count", () => {
    const a = sanitizeArtifact({
      type: "table",
      columns: ["Item", "Amount"],
      rows: [["Rent", "2500"], ["Phone"], ["Internet", "60"]],
    });
    expect(a).toEqual({
      type: "table",
      columns: ["Item", "Amount"],
      rows: [
        ["Rent", "2500"],
        ["Internet", "60"],
      ],
      caption: null,
    });
  });

  it("strips em-dashes from strings", () => {
    const a = sanitizeArtifact({ type: "stat_card", label: "Spend — May", value: "100" });
    expect(a).toEqual({ type: "stat_card", label: "Spend - May", value: "100", sublabel: null });
  });

  it("builds a checklist with default done=false", () => {
    const a = sanitizeArtifact({
      type: "checklist",
      title: "Trip prep",
      items: [{ text: "Renew passport" }, { text: "Book hotel", done: true }],
    });
    expect(a).toEqual({
      type: "checklist",
      title: "Trip prep",
      items: [
        { text: "Renew passport", done: false },
        { text: "Book hotel", done: true },
      ],
    });
  });
});
