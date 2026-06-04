import { describe, it, expect } from "vitest";
import { canDeleteSpace } from "@/lib/data/can-delete-space";

/**
 * Regression for "deleting a workspace does not delete it": the action guarded
 * `kind !== "circle"`, so an office (workspace) delete silently no-op'd. The
 * guard now allows BOTH workspaces and circles for an owner who retypes the
 * name, and still refuses personal spaces.
 */
describe("canDeleteSpace", () => {
  it("ALLOWS an owner to delete a workspace (the bug)", () => {
    expect(
      canDeleteSpace({ kind: "office", role: "owner", confirmName: "Acme", orgName: "Acme" }),
    ).toEqual({ ok: true });
  });

  it("allows an owner to delete a circle", () => {
    expect(
      canDeleteSpace({ kind: "circle", role: "owner", confirmName: "Family", orgName: "Family" }),
    ).toEqual({ ok: true });
  });

  it("matches the name case-insensitively and trims", () => {
    expect(
      canDeleteSpace({ kind: "office", role: "owner", confirmName: "  acme ", orgName: "Acme" }),
    ).toEqual({ ok: true });
  });

  it("never allows deleting a personal space", () => {
    expect(
      canDeleteSpace({ kind: "personal", role: "owner", confirmName: "x", orgName: "x" }),
    ).toEqual({ ok: false, reason: "personal" });
  });

  it("refuses a non-owner", () => {
    expect(
      canDeleteSpace({ kind: "office", role: "household", confirmName: "Acme", orgName: "Acme" }),
    ).toEqual({ ok: false, reason: "not_owner" });
  });

  it("refuses a name mismatch", () => {
    expect(
      canDeleteSpace({ kind: "office", role: "owner", confirmName: "Acmee", orgName: "Acme" }),
    ).toEqual({ ok: false, reason: "name_mismatch" });
  });
});
