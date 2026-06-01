import { describe, it, expect } from "vitest";
import {
  composeUploadSnippet,
  formatStructuredFields,
  resolveFields,
} from "@/lib/ai/structured-context";

// Regression for the Ask Oria retrieval bug: when a flight document was
// uploaded, Ask Oria only saw OCR-noisy raw text from document_chunks and
// never the clean fields the extractor produced into extracted_entities.
// These tests pin the deterministic assembly that now feeds the model.

const FLIGHT_FIELDS = {
  airline: "Air France",
  flight_number: "AF331",
  departure_datetime: "2026-07-06T08:00:00Z",
  origin_airport: "Boston (BOS)",
  destination_airport: "Paris (CDG)",
  confirmation_code: "X7Q9PL",
  seat: "",
  notes: null,
};

describe("formatStructuredFields", () => {
  it("renders a flight extraction as compact key/value lines", () => {
    const block = formatStructuredFields("flight", FLIGHT_FIELDS);
    expect(block).toContain("Structured fields (flight):");
    expect(block).toContain("flight_number: AF331");
    expect(block).toContain("departure_datetime: 2026-07-06T08:00:00Z");
    expect(block).toContain("destination_airport: Paris (CDG)");
  });

  it("drops empty and null fields", () => {
    const block = formatStructuredFields("flight", FLIGHT_FIELDS);
    expect(block).not.toContain("seat:");
    expect(block).not.toContain("notes:");
  });

  it("returns an empty string when there is nothing to show", () => {
    expect(formatStructuredFields("generic", {})).toBe("");
    expect(formatStructuredFields("generic", { a: null, b: "" })).toBe("");
  });

  it("caps the block near the token budget", () => {
    const huge = { blob: "x".repeat(5000) };
    const block = formatStructuredFields("generic", huge, 200);
    expect(block.length).toBeLessThanOrEqual(200);
    expect(block.endsWith("...")).toBe(true);
  });

  it("flattens arrays and one level of nested objects inline", () => {
    const block = formatStructuredFields("itinerary", {
      legs: ["BOS->CDG", "CDG->BOS"],
      passenger: { name: "Sam", ff_number: "12345" },
    });
    expect(block).toContain("legs: BOS->CDG, CDG->BOS");
    expect(block).toContain("passenger: name=Sam, ff_number=12345");
  });

  it("never emits an em-dash", () => {
    const block = formatStructuredFields("flight", FLIGHT_FIELDS);
    expect(block).not.toContain("—");
  });
});

describe("resolveFields", () => {
  it("returns base fields when not user-verified", () => {
    expect(resolveFields({ a: 1 }, { a: 2 }, false)).toEqual({ a: 1 });
  });

  it("overlays user edits when verified", () => {
    expect(resolveFields({ a: 1, b: 2 }, { a: 9 }, true)).toEqual({ a: 9, b: 2 });
  });
});

describe("composeUploadSnippet", () => {
  it("puts the structured block above the raw OCR text", () => {
    const structured = formatStructuredFields("flight", FLIGHT_FIELDS);
    const raw = "B0ARD1NG PA55 ... AF 331 ... g4rbled 0CR";
    const out = composeUploadSnippet(structured, raw);
    expect(out.indexOf("Structured fields")).toBeLessThan(out.indexOf("g4rbled"));
    expect(out).toContain("AF331"); // clean value present, not just the OCR
  });

  it("falls back to whichever side is present", () => {
    expect(composeUploadSnippet("", "raw")).toBe("raw");
    expect(composeUploadSnippet("block", "")).toBe("block");
  });
});
