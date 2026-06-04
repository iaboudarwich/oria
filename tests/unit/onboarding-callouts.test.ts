import { describe, it, expect } from "vitest";
import { buildCallouts } from "@/lib/onboarding/callouts";
import { EMPTY_USER_CONTEXT, type SetupPlan, type UserContext } from "@/lib/onboarding/types";

/**
 * F2 (Round 14.9): the build-animation callouts must name the user's ACTUAL
 * answers, not generic copy. Pure, no AI key.
 */

const plan: SetupPlan = {
  spaces: [
    {
      label: "Personal",
      area: "personal",
      workspaces: [
        {
          name: "Home",
          kind: "personal",
          description: "",
          accent_color: null,
          template_id: "renter",
          ask_oria_starters: [],
          sections: [
            { key: "lease", title: "Lease and landlord", icon: "scales", priority: 0 },
            { key: "rent", title: "Rent payments", icon: "wallet", priority: 1 },
            { key: "utilities", title: "Utilities", icon: "home", priority: 2 },
          ],
        },
      ],
    },
  ],
};

const ctx: UserContext = {
  roles: ["renter"],
  life_contexts: ["home life"],
  chaos_areas: ["bills and finances"],
  data_sources: ["email"],
  collaborators: [],
  week_one_priority: "keep on top of rent",
  notes: "",
  intent: "renter",
};

describe("buildCallouts", () => {
  const callouts = buildCallouts(plan, ctx);
  const planSections = ["Lease and landlord", "Rent payments", "Utilities"];
  const ctxFragments = [
    ctx.week_one_priority,
    ...ctx.chaos_areas,
    ...ctx.roles,
    ...ctx.life_contexts,
    ...ctx.data_sources,
  ];

  it("produces three callouts for a three-section plan", () => {
    expect(callouts).toHaveLength(3);
  });

  it("every callout names a REAL plan section", () => {
    for (const c of callouts) expect(planSections).toContain(c.section);
  });

  it("every callout's reason is a REAL answer fragment, not generic copy", () => {
    for (const c of callouts) {
      expect(c.reason.length).toBeGreaterThan(0);
      expect(ctxFragments).toContain(c.reason);
    }
  });

  it("leads with the week-one priority as the first reason", () => {
    expect(callouts[0].reason).toBe("keep on top of rent");
    expect(callouts[0].section).toBe("Lease and landlord");
  });

  it("uses distinct sections and distinct reasons across the three", () => {
    expect(new Set(callouts.map((c) => c.section)).size).toBe(3);
    expect(new Set(callouts.map((c) => c.reason)).size).toBe(3);
  });
});

describe("graceful edges", () => {
  it("returns nothing when the plan has no sections", () => {
    expect(buildCallouts({ spaces: [] }, ctx)).toEqual([]);
  });

  it("names sections with an empty reason when nothing was captured", () => {
    const callouts = buildCallouts(plan, EMPTY_USER_CONTEXT);
    expect(callouts.length).toBe(3);
    for (const c of callouts) {
      expect(c.section.length).toBeGreaterThan(0);
      expect(c.reason).toBe("");
    }
  });

  it("does not repeat a section even if the plan lists it twice", () => {
    const dupPlan: SetupPlan = {
      spaces: [
        {
          label: "P",
          area: "personal",
          workspaces: [
            {
              name: "W",
              kind: "personal",
              description: "",
              accent_color: null,
              template_id: "custom",
              ask_oria_starters: [],
              sections: [
                { key: "a", title: "Taxes", icon: "scales", priority: 0 },
                { key: "b", title: "Taxes", icon: "scales", priority: 1 },
              ],
            },
          ],
        },
      ],
    };
    const callouts = buildCallouts(dupPlan, ctx);
    expect(callouts).toHaveLength(1);
    expect(callouts[0].section).toBe("Taxes");
  });
});
