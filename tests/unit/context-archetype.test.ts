import { describe, it, expect } from "vitest";
import { resolveContextArchetype } from "@/lib/daily/context-surface";
import { PROVISIONING, type OnboardingIntent } from "@/lib/onboarding/intents";

/**
 * Regression: the R16 archetype resolver tested kind==="office" before
 * parent_kind==="work", and the executor tags work orgs as office, so every
 * business intent (founder / freelancer / business-owner) resolved to the
 * Family Office surface and Business was unreachable. Now a recognized business
 * work-template resolves to Business; an unsignaled office org (the genuine
 * family office) stays Family Office.
 */

// Mirror lib/onboarding/plan-executor: the primary work org is office /
// parent_kind work carrying the intent's template_key; a personal-area intent
// keys the personal org.
function orgForIntent(intent: OnboardingIntent) {
  const p = PROVISIONING[intent];
  return p.area === "work"
    ? { kind: "office", parent_kind: "work", template_key: p.templateKey }
    : { kind: "personal", parent_kind: "personal", template_key: p.templateKey };
}

describe("resolveContextArchetype", () => {
  it("founder, freelancer, and business-owner land on Business", () => {
    // founder and business-owner both provision the freelancer work template.
    expect(resolveContextArchetype(orgForIntent("founder"))).toBe("business");
    expect(resolveContextArchetype(orgForIntent("freelancer"))).toBe("business");
    expect(resolveContextArchetype(orgForIntent("teacher"))).toBe("business");
  });

  it("a genuine family office still lands on Family Office", () => {
    expect(resolveContextArchetype(orgForIntent("family_office"))).toBe("family_office");
    // an unsignaled office org (custom / null template) is preserved
    expect(
      resolveContextArchetype({ kind: "office", parent_kind: "work", template_key: "custom" }),
    ).toBe("family_office");
    expect(
      resolveContextArchetype({ kind: "office", parent_kind: "work", template_key: null }),
    ).toBe("family_office");
  });

  it("investor and personal are unchanged", () => {
    expect(resolveContextArchetype(orgForIntent("investor"))).toBe("investor");
    expect(resolveContextArchetype(orgForIntent("personal"))).toBe("personal");
    expect(
      resolveContextArchetype({
        kind: "personal",
        parent_kind: "personal",
        template_key: "investor",
      }),
    ).toBe("investor");
  });

  it("every launch intent lands on its provisioning archetype", () => {
    for (const intent of Object.keys(PROVISIONING) as OnboardingIntent[]) {
      expect(resolveContextArchetype(orgForIntent(intent))).toBe(PROVISIONING[intent].archetype);
    }
  });
});
