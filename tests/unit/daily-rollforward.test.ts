import { describe, it, expect } from "vitest";
import { computeRolloverCards } from "@/lib/daily/rollforward";
import type { SignalReminder } from "@/lib/daily/signals";

// Round 16 F6: roll-forward must be idempotent so a repeated run (the hourly
// cron, a retry, a second visit) can never duplicate a carried item.

const overdue: SignalReminder[] = [
  { id: "r1", title: "Pay rent", dueAt: "2026-06-01T09:00:00Z", uploadId: null },
  { id: "r2", title: "Renew passport", dueAt: "2026-06-02T09:00:00Z", uploadId: "up1" },
];

describe("computeRolloverCards — idempotency", () => {
  it("carries every unfinished item on a fresh day", () => {
    const rows = computeRolloverCards(overdue, new Set(), "2026-06-03", "user1", "org1");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      card_kind: "rollover",
      source_table: "reminders",
      source_id: "r1",
      for_date: "2026-06-03",
      title: "Pay rent",
      href: "/dashboard",
    });
    // A reminder linked to an upload deep-links to it.
    expect(rows[1].href).toBe("/dashboard/uploads/up1");
  });

  it("carries nothing the second time (already-carried ids skipped)", () => {
    const already = new Set(["r1", "r2"]);
    expect(computeRolloverCards(overdue, already, "2026-06-03", "user1", "org1")).toHaveLength(0);
  });

  it("carries only the newly-overdue item on an incremental run", () => {
    const already = new Set(["r1"]);
    const rows = computeRolloverCards(overdue, already, "2026-06-03", "user1", "org1");
    expect(rows.map((r) => r.source_id)).toEqual(["r2"]);
  });

  it("does not duplicate when the same reminder appears twice in input", () => {
    const dupe = [...overdue, overdue[0]];
    const rows = computeRolloverCards(dupe, new Set(), "2026-06-03", "user1", "org1");
    expect(rows.filter((r) => r.source_id === "r1")).toHaveLength(1);
  });
});
