import { describe, it, expect } from "vitest";
import { isAccountOwnerInPersonal } from "@/lib/data/organizations";

/**
 * God's Eye is the only retrieval path that legitimately spans
 * multiple organizations. It must be gated to: (a) the Personal-space
 * owner, and only when (b) they're currently sitting in their Personal
 * space. Any other combination (workspace member, circle member,
 * non-owner viewing Personal) must NOT trigger God's Eye.
 *
 * This pure function is the SINGLE source of truth that gates Ask
 * Oria's crossSpace flag, Calendar's crossSpace loader, and cross-
 * space search. If this returns true incorrectly, every privacy
 * guarantee in the app collapses.
 */
describe("isAccountOwnerInPersonal — the sole God's Eye gate", () => {
  it("Personal + owner → true", () => {
    const ctx = {
      organization: { kind: "personal" as const },
      membership: { role: "owner" as const },
    } as Parameters<typeof isAccountOwnerInPersonal>[0];
    expect(isAccountOwnerInPersonal(ctx)).toBe(true);
  });

  it("Workspace + owner → false (workspace owner is NOT account owner)", () => {
    const ctx = {
      organization: { kind: "office" as const },
      membership: { role: "owner" as const },
    } as Parameters<typeof isAccountOwnerInPersonal>[0];
    expect(isAccountOwnerInPersonal(ctx)).toBe(false);
  });

  it("Circle + owner → false", () => {
    const ctx = {
      organization: { kind: "circle" as const },
      membership: { role: "owner" as const },
    } as Parameters<typeof isAccountOwnerInPersonal>[0];
    expect(isAccountOwnerInPersonal(ctx)).toBe(false);
  });

  it("Personal + non-owner role → false", () => {
    const roles = ["assistant", "staff", "household", "accountant", "external"] as const;
    for (const role of roles) {
      const ctx = {
        organization: { kind: "personal" as const },
        membership: { role },
      } as Parameters<typeof isAccountOwnerInPersonal>[0];
      expect(isAccountOwnerInPersonal(ctx), `Personal + ${role} should be false`).toBe(false);
    }
  });
});
