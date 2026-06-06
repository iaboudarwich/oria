/**
 * Pure guard for deleting a space. Kept free of server imports so it is
 * directly unit-testable. Personal spaces are NEVER deletable (they
 * auto-create). Both circles AND workspaces (office) are deletable by their
 * owner once they retype the name.
 *
 * This is the regression surface for the bug: the delete action previously
 * guarded `kind !== "circle"`, so a WORKSPACE delete silently no-op'd and the
 * workspace persisted after refresh. The guard now allows office.
 */
export type DeleteSpaceReason = "personal" | "not_owner" | "name_mismatch";

export type CanDeleteSpaceDecision = { ok: true } | { ok: false; reason: DeleteSpaceReason };

export function canDeleteSpace(input: {
  kind: string;
  role: string;
  confirmName: string;
  orgName: string;
}): CanDeleteSpaceDecision {
  if (input.kind === "personal") return { ok: false, reason: "personal" };
  if (input.role !== "owner") return { ok: false, reason: "not_owner" };
  if (input.confirmName.trim().toLowerCase() !== input.orgName.trim().toLowerCase()) {
    return { ok: false, reason: "name_mismatch" };
  }
  return { ok: true };
}
