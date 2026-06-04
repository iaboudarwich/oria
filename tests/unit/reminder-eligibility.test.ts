import { describe, it, expect } from "vitest";
import { reminderEligibilityForItem } from "@/lib/ai/reminder-eligibility";

// Regression for "a diet meal got added as a reminder" and the flight
// double-entry bug: event-shaped docs (boarding pass, ticket, itinerary,
// schedule) self-surface on the calendar via memory_items.occurred_at, so they
// must NOT also auto-create a "suggested" reminder. Smart reminders fire only
// for the bill / recurring-receipt positive list.

describe("reminderEligibilityForItem: excluded kinds make NO reminder", () => {
  it("a flight (boarding pass) does NOT qualify (it is its own calendar event)", () => {
    expect(
      reminderEligibilityForItem({
        document_type: "boarding_pass",
        smart_section: null,
        is_recurring: false,
      }).eligible,
    ).toBe(false);
  });

  it("a flight (ticket) does NOT qualify", () => {
    expect(
      reminderEligibilityForItem({
        document_type: "ticket",
        smart_section: null,
        is_recurring: false,
      }).eligible,
    ).toBe(false);
  });

  it("an itinerary does NOT qualify", () => {
    expect(
      reminderEligibilityForItem({
        document_type: "itinerary",
        smart_section: null,
        is_recurring: false,
      }).eligible,
    ).toBe(false);
  });

  it("a scheduled appointment does NOT qualify (event-shaped)", () => {
    expect(
      reminderEligibilityForItem({
        document_type: "schedule",
        smart_section: null,
        is_recurring: false,
      }).eligible,
    ).toBe(false);
  });

  it("a meal (diet, photo) does not qualify, even when recurring", () => {
    expect(
      reminderEligibilityForItem({
        document_type: "photo",
        smart_section: "diet",
        is_recurring: true,
      }).eligible,
    ).toBe(false);
  });

  it("a recurring diet note does not qualify", () => {
    expect(
      reminderEligibilityForItem({
        document_type: "handwritten_note",
        smart_section: "diet",
        is_recurring: true,
      }).eligible,
    ).toBe(false);
  });

  it("a plain photo does not qualify", () => {
    expect(
      reminderEligibilityForItem({
        document_type: "photo",
        smart_section: null,
        is_recurring: false,
      }).eligible,
    ).toBe(false);
  });

  it("a note does not qualify", () => {
    expect(
      reminderEligibilityForItem({
        document_type: "handwritten_note",
        smart_section: null,
        is_recurring: false,
      }).eligible,
    ).toBe(false);
  });

  it("a one-off receipt does not qualify", () => {
    expect(
      reminderEligibilityForItem({
        document_type: "receipt",
        smart_section: null,
        is_recurring: false,
      }).eligible,
    ).toBe(false);
  });
});

describe("reminderEligibilityForItem: eligible kinds DO make a reminder", () => {
  it("a bill (smart_section bills) qualifies with 3-day lead", () => {
    const r = reminderEligibilityForItem({
      document_type: null,
      smart_section: "bills",
      is_recurring: true,
    });
    expect(r).toEqual({ eligible: true, kind: "bill", leadDays: 3 });
  });

  it("an invoice qualifies as a bill", () => {
    expect(
      reminderEligibilityForItem({
        document_type: "invoice",
        smart_section: null,
        is_recurring: false,
      }).kind,
    ).toBe("bill");
  });

  it("a recurring receipt qualifies", () => {
    expect(
      reminderEligibilityForItem({
        document_type: "receipt",
        smart_section: null,
        is_recurring: true,
      }).kind,
    ).toBe("receipt_recurring");
  });
});
