/**
 * Circle scoping rules, reconciled with the 16.8 space/scope model: a "circle"
 * is an organization of kind="circle" (it carries its own name + accent_color);
 * an item is scoped by which organization owns it (organization_id). PRIVATE
 * BY DEFAULT means the item lives in the owner's personal space; sharing means
 * moving it into exactly one circle. Cross-circle isolation is enforced in RLS
 * by membership (is_org_member), NOT in the UI; the functions here are the pure
 * MIRROR of that RLS used by the boundary tests, plus the re-scope + orphan
 * rules. We do not duplicate the space model; we read it.
 */

export type ScopeKind = "private" | "circle";

/** Items are private by default. Sharing is an explicit move into one circle. */
export const DEFAULT_SCOPE: ScopeKind = "private";

export type ItemScope =
  | { kind: "private" }
  | { kind: "circle"; circleId: string; circleName: string; circleColor: string | null };

/** The plain-language label key for an item's scope (localized in the UI). */
export function scopeLabelKey(scope: ItemScope): "scope_private" | "scope_circle" {
  return scope.kind === "private" ? "scope_private" : "scope_circle";
}

/**
 * The pure mirror of the membership-based read RLS: a viewer may see an item
 * when they created it, or when they are a member of the org that owns it. A
 * circle member belongs ONLY to that circle, so they never see another circle's
 * or anyone's private items. The owner belongs to many orgs, so they see the
 * union. The boundary tests assert this AND the live RLS (verify-circle-rls).
 */
export function canViewItem(input: {
  itemOrgId: string;
  createdBy?: string | null;
  viewerId: string;
  viewerOrgIds: string[];
}): boolean {
  if (input.createdBy && input.createdBy === input.viewerId) return true;
  return input.viewerOrgIds.includes(input.itemOrgId);
}

/**
 * May this user move an item into the target scope? They must belong to the
 * target org (their personal space for "make private", or a circle they are in
 * for "share"). Moving into a circle they are not a member of is refused.
 */
export function canRescope(input: { viewerOrgIds: string[]; targetOrgId: string }): boolean {
  return input.viewerOrgIds.includes(input.targetOrgId);
}

/**
 * Orphan rule: when a circle is deleted, its scoped items must NOT be destroyed.
 * They revert to private under the deleting owner (who could already see them
 * while the circle existed, so this grants no new access), in the owner's
 * personal space. Returns that target org, or null when it cannot be resolved
 * (then the caller must refuse the delete rather than cascade-destroy).
 */
export function orphanRevertTarget(ownerPersonalOrgId: string | null | undefined): string | null {
  return ownerPersonalOrgId ?? null;
}

/** The shareable, org-owned tables whose rows revert on circle delete. */
export const ORG_SCOPED_ITEM_TABLES = [
  "uploads",
  "memory_items",
  "reminders",
  "trackables",
  "manual_assets",
] as const;
