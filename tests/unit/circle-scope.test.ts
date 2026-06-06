import { describe, it, expect } from "vitest";
import {
  DEFAULT_SCOPE,
  scopeLabelKey,
  canViewItem,
  canRescope,
  orphanRevertTarget,
} from "@/lib/circles/scope";

// Boundary fixtures: an owner in their personal space + two circles; a member
// in ONLY circle A; an outsider in nothing shared.
const OWNER = "owner";
const MEMBER = "member";
const PERSONAL = "org-personal-owner";
const CIRCLE_A = "org-circle-a";
const CIRCLE_B = "org-circle-b";

const ownerOrgIds = [PERSONAL, CIRCLE_A, CIRCLE_B];
const memberOrgIds = [CIRCLE_A]; // member belongs ONLY to circle A

describe("default scope", () => {
  it("is private", () => {
    expect(DEFAULT_SCOPE).toBe("private");
  });
});

describe("canViewItem (the RLS mirror, cross-circle isolation)", () => {
  it("a member of circle A sees circle A items", () => {
    expect(canViewItem({ itemOrgId: CIRCLE_A, viewerId: MEMBER, viewerOrgIds: memberOrgIds })).toBe(
      true,
    );
  });

  it("a member of circle A CANNOT see circle B items", () => {
    expect(canViewItem({ itemOrgId: CIRCLE_B, viewerId: MEMBER, viewerOrgIds: memberOrgIds })).toBe(
      false,
    );
  });

  it("a member CANNOT see the owner's PRIVATE items", () => {
    expect(canViewItem({ itemOrgId: PERSONAL, viewerId: MEMBER, viewerOrgIds: memberOrgIds })).toBe(
      false,
    );
  });

  it("the owner sees the UNION of personal + every circle", () => {
    expect(canViewItem({ itemOrgId: PERSONAL, viewerId: OWNER, viewerOrgIds: ownerOrgIds })).toBe(
      true,
    );
    expect(canViewItem({ itemOrgId: CIRCLE_A, viewerId: OWNER, viewerOrgIds: ownerOrgIds })).toBe(
      true,
    );
    expect(canViewItem({ itemOrgId: CIRCLE_B, viewerId: OWNER, viewerOrgIds: ownerOrgIds })).toBe(
      true,
    );
  });

  it("a creator always sees their own item even if not a current member", () => {
    expect(
      canViewItem({ itemOrgId: CIRCLE_A, createdBy: MEMBER, viewerId: MEMBER, viewerOrgIds: [] }),
    ).toBe(true);
  });

  it("a REMOVED member immediately loses access (orgIds no longer include the circle)", () => {
    const removedOrgIds: string[] = []; // membership revoked
    expect(
      canViewItem({ itemOrgId: CIRCLE_A, viewerId: MEMBER, viewerOrgIds: removedOrgIds }),
    ).toBe(false);
  });
});

describe("canRescope (move into a scope)", () => {
  it("allows moving into a circle the user belongs to", () => {
    expect(canRescope({ viewerOrgIds: ownerOrgIds, targetOrgId: CIRCLE_A })).toBe(true);
  });

  it("refuses moving into a circle the user does NOT belong to", () => {
    expect(canRescope({ viewerOrgIds: memberOrgIds, targetOrgId: CIRCLE_B })).toBe(false);
  });
});

describe("orphan rule on circle delete", () => {
  it("reverts to the owner's personal space", () => {
    expect(orphanRevertTarget(PERSONAL)).toBe(PERSONAL);
  });
  it("returns null when no personal space can be resolved (caller must refuse)", () => {
    expect(orphanRevertTarget(null)).toBeNull();
  });
});

describe("scope label", () => {
  it("maps to the plain-language key", () => {
    expect(scopeLabelKey({ kind: "private" })).toBe("scope_private");
    expect(
      scopeLabelKey({
        kind: "circle",
        circleId: CIRCLE_A,
        circleName: "Family",
        circleColor: null,
      }),
    ).toBe("scope_circle");
  });
});
