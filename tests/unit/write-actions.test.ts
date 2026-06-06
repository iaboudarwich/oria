import { describe, it, expect } from "vitest";
import {
  actionNeedsClarification,
  inverseOf,
  isWriteActionType,
  type ProposedAction,
} from "@/lib/actions/write-actions";
import { localDateTimeToISO } from "@/lib/utils/tz";

describe("actionNeedsClarification (never guess-and-execute)", () => {
  it("asks when a reminder has no title", () => {
    const p: ProposedAction = {
      type: "reminder.create",
      title: "",
      date: "2026-06-06",
      time: "14:00",
    };
    expect(actionNeedsClarification(p)).toBe("missing_title");
  });

  it("asks when a reminder has no explicit time (no silent default)", () => {
    const p: ProposedAction = {
      type: "reminder.create",
      title: "call movers",
      date: "2026-06-06",
      time: null,
    };
    expect(actionNeedsClarification(p)).toBe("missing_when");
  });

  it("is confirmable when title + date + time are present", () => {
    const p: ProposedAction = {
      type: "reminder.create",
      title: "call movers",
      date: "2026-06-06",
      time: "14:00",
    };
    expect(actionNeedsClarification(p)).toBeNull();
  });

  it("complete/delete need a target", () => {
    expect(actionNeedsClarification({ type: "reminder.complete", reminderId: "" })).toBe(
      "missing_target",
    );
    expect(actionNeedsClarification({ type: "reminder.delete", reminderId: "r1" })).toBeNull();
  });

  it("trackable status needs a valid status + target", () => {
    expect(
      actionNeedsClarification({ type: "trackable.status", trackableId: "", status: "done" }),
    ).toBe("missing_target");
    expect(
      actionNeedsClarification({ type: "trackable.status", trackableId: "t1", status: "done" }),
    ).toBeNull();
  });
});

describe("inverseOf (undo reverses the action)", () => {
  it("create undoes by deleting, delete by restoring", () => {
    expect(inverseOf("reminder.create")).toBe("delete_created");
    expect(inverseOf("reminder.delete")).toBe("restore_deleted");
    expect(inverseOf("reminder.complete")).toBe("restore_prior_done");
    expect(inverseOf("trackable.status")).toBe("restore_prior_status");
  });
});

describe("type guard + tz-correctness of the create payload", () => {
  it("guards the action type", () => {
    expect(isWriteActionType("reminder.create")).toBe(true);
    expect(isWriteActionType("reminder.nuke")).toBe(false);
  });

  it("resolves a reminder due instant in the user's zone (2pm stays 2pm)", () => {
    // 2026-06-06 14:00 in New York is 18:00 UTC (EDT, UTC-4).
    const iso = localDateTimeToISO("2026-06-06", "14:00", "America/New_York");
    expect(iso).toBe("2026-06-06T18:00:00.000Z");
  });
});
