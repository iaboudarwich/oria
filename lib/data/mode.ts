import "server-only";

import type { OrgKind } from "@/lib/supabase/types";

/**
 * Oria has two top-level modes the user can switch between:
 *
 *   • personal. life organization. Maps to org kinds: "personal" + "circle".
 *   • work    . operational intelligence. Maps to org kind: "office".
 *
 * The active mode follows the active space's kind. Switching modes flips
 * the active-space cookie to the most recent org of the other kind.
 */
export type Mode = "personal" | "work";

export function modeForOrgKind(kind: OrgKind): Mode {
  return kind === "office" ? "work" : "personal";
}

/** Inverse: which org kinds belong to a given mode. */
export function kindsForMode(mode: Mode): OrgKind[] {
  return mode === "work" ? ["office"] : ["personal", "circle"];
}
