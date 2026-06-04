import { describe, it, expect } from "vitest";
import {
  computeSuggestions,
  detectCalendarConflicts,
  inferSectionFromDocType,
} from "@/lib/daily/suggestions";
import type { DaySignals } from "@/lib/daily/signals";

// Round 16 F3: every suggestion must be grounded in a real signal AND carry a
// real, executable action on Yes. These tests pin the signal -> action mapping
// so the "Yes executes a real action" contract cannot silently regress.

const DAY_START = new Date("2026-06-03T00:00:00Z");

function makeSignals(partial: Partial<DaySignals>): DaySignals {
  return {
    dayStart: DAY_START,
    dayEnd: new Date(DAY_START.getTime() + 86_400_000),
    todayEvents: [],
    remindersDueToday: [],
    remindersOverdue: [],
    expiringTrackables: [],
    recurringBills: [],
    unfiledUploads: [],
    stuckUploads: [],
    recentlyFiled: [],
    actionableDocuments: [],
    docTypeByUpload: {},
    ...partial,
  };
}

describe("computeSuggestions — signal to executable action", () => {
  it("expiring Trackable yes-action creates a reminder on the renewal date", () => {
    const s = makeSignals({
      expiringTrackables: [
        { id: "t1", title: "Home insurance", renewalDate: "2026-06-13", category: "insurance" },
      ],
    });
    const [sug] = computeSuggestions(s, [], new Set());
    expect(sug.pattern).toBe("expiring_trackable");
    expect(sug.params.days).toBe(10);
    expect(sug.action).toMatchObject({ kind: "create_reminder", leadDays: 7 });
    expect((sug.action as { dueAt: string }).dueAt).toBe(
      new Date("2026-06-13").toISOString(),
    );
  });

  it("untracked recurring bill yes-action creates a subscription Trackable", () => {
    const s = makeSignals({
      recurringBills: [{ id: "m1", merchant: "Netflix", amount: 15, interval: "monthly" }],
    });
    const [sug] = computeSuggestions(s, [], new Set());
    expect(sug.pattern).toBe("untracked_recurring");
    expect(sug.action).toEqual({
      kind: "create_trackable",
      title: "Netflix",
      category: "subscription",
      costPeriod: "monthly",
    });
  });

  it("does not suggest tracking a bill that is already a Trackable", () => {
    const s = makeSignals({
      recurringBills: [{ id: "m1", merchant: "Netflix", amount: 15, interval: "monthly" }],
    });
    expect(computeSuggestions(s, ["Netflix subscription"], new Set())).toHaveLength(0);
  });

  it("unfiled upload only fires when a section can be inferred, and files it", () => {
    const inferable = makeSignals({
      unfiledUploads: [{ id: "u1", title: "Policy", filename: null, section: null }],
      docTypeByUpload: { u1: "insurance_policy" },
    });
    const [sug] = computeSuggestions(inferable, [], new Set());
    expect(sug.action).toEqual({ kind: "file_upload", uploadId: "u1", section: "legal" });

    const notInferable = makeSignals({
      unfiledUploads: [{ id: "u2", title: "Mystery", filename: null, section: null }],
      docTypeByUpload: { u2: "something_unknown" },
    });
    expect(computeSuggestions(notInferable, [], new Set())).toHaveLength(0);
  });

  it("stuck upload yes-action re-queues processing", () => {
    const s = makeSignals({
      stuckUploads: [{ id: "u9", title: "Scan", filename: null, section: null }],
    });
    const [sug] = computeSuggestions(s, [], new Set());
    expect(sug.action).toEqual({ kind: "requeue_upload", uploadId: "u9" });
  });

  it("document with a deadline yes-action creates a reminder, unless one exists", () => {
    const base = {
      actionableDocuments: [
        {
          uploadId: "d1",
          title: "Invoice",
          docType: "invoice",
          fieldLabel: "due date",
          fieldDate: "2026-06-20",
        },
      ],
    };
    const [sug] = computeSuggestions(makeSignals(base), [], new Set());
    expect(sug.pattern).toBe("document_action");
    expect((sug.action as { dueAt: string }).dueAt).toBe(new Date("2026-06-20").toISOString());

    const withReminder = makeSignals({
      ...base,
      remindersDueToday: [{ id: "r1", title: "Invoice", dueAt: "2026-06-20T00:00:00Z", uploadId: "d1" }],
    });
    expect(computeSuggestions(withReminder, [], new Set())).toHaveLength(0);
  });

  it("respects dismissed keys", () => {
    const s = makeSignals({
      stuckUploads: [{ id: "u9", title: "Scan", filename: null, section: null }],
    });
    expect(computeSuggestions(s, [], new Set(["stuck_upload:u9"]))).toHaveLength(0);
  });
});

describe("detectCalendarConflicts", () => {
  const ev = (id: string, start: string, end: string) => ({
    id,
    title: id,
    startsAt: start,
    endsAt: end,
    isAllDay: false,
  });

  it("flags overlapping timed events", () => {
    const pairs = detectCalendarConflicts([
      ev("a", "2026-06-03T09:00:00Z", "2026-06-03T10:00:00Z"),
      ev("b", "2026-06-03T09:30:00Z", "2026-06-03T10:30:00Z"),
    ]);
    expect(pairs).toHaveLength(1);
  });

  it("does not flag back-to-back events", () => {
    const pairs = detectCalendarConflicts([
      ev("a", "2026-06-03T09:00:00Z", "2026-06-03T10:00:00Z"),
      ev("b", "2026-06-03T10:00:00Z", "2026-06-03T11:00:00Z"),
    ]);
    expect(pairs).toHaveLength(0);
  });
});

describe("inferSectionFromDocType", () => {
  it("maps known document kinds to a section", () => {
    expect(inferSectionFromDocType("insurance_policy")).toBe("legal");
    expect(inferSectionFromDocType("bank_statement")).toBe("finance");
    expect(inferSectionFromDocType("flight_booking")).toBe("travel");
  });
  it("returns null when there is no confident mapping", () => {
    expect(inferSectionFromDocType("zzz")).toBeNull();
    expect(inferSectionFromDocType(null)).toBeNull();
  });
});
