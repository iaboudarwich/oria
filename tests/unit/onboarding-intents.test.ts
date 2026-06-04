import { describe, it, expect } from "vitest";
import {
  classifyIntent,
  questionTreeKey,
  provisioningFor,
  resolveTemplateKey,
  INTENT_TREE,
  type OnboardingIntent,
} from "@/lib/onboarding/intents";
import bank from "@/lib/onboarding/question-bank.json";

/**
 * F1 branching (Round 14.9). Proves the thesis: Q1 routes different people to
 * different question trees and different provisioned setups. Pure, no AI key.
 */

const TREES = (bank as { trees: Record<string, { id: string }[]> }).trees;

describe("classifyIntent", () => {
  const cases: Array<[string, OnboardingIntent]> = [
    ["I run a small VC fund and manage a portfolio of startups", "investor"],
    ["I manage my family's estate and a couple of trusts", "family_office"],
    ["I'm the founder of an early-stage startup", "founder"],
    ["I freelance as a design consultant for a few clients", "freelancer"],
    ["I'm looking for a job, sending applications out", "job_seeker"],
    ["I'm a student studying mechanical engineering", "student"],
    ["I'm a parent raising two kids", "parent"],
    ["I rent an apartment downtown", "renter"],
    ["I'm caring for my elderly mother and her medications", "caregiver"],
    ["I teach high school history", "teacher"],
    ["I'm a digital nomad, always traveling", "traveler"],
    ["I just like keeping my life organized", "personal"],
  ];
  for (const [text, expected] of cases) {
    it(`"${text.slice(0, 32)}..." -> ${expected}`, () => {
      expect(classifyIntent(text)).toBe(expected);
    });
  }

  it("defaults to personal on empty / unknown input", () => {
    expect(classifyIntent("")).toBe("personal");
    expect(classifyIntent("hi there")).toBe("personal");
  });

  it("prefers family_office over investor when both could match", () => {
    expect(classifyIntent("I run our family office and invest the portfolio")).toBe("family_office");
  });
});

describe("different intents -> different question trees", () => {
  it("every intent maps to a tree that exists in the bank", () => {
    for (const intent of Object.keys(INTENT_TREE) as OnboardingIntent[]) {
      expect(TREES[questionTreeKey(intent)], `tree for ${intent}`).toBeTruthy();
    }
  });

  it("investor, parent, and personal ask genuinely different questions", () => {
    const inv = TREES[questionTreeKey("investor")].map((q) => q.id);
    const par = TREES[questionTreeKey("parent")].map((q) => q.id);
    const per = TREES[questionTreeKey("personal")].map((q) => q.id);
    expect(inv).not.toEqual(par);
    expect(inv).not.toEqual(per);
    expect(par).not.toEqual(per);
    // The investor tree asks about deal flow / LP, not "what feels chaotic" generically.
    expect(inv.some((id) => id.startsWith("inv_"))).toBe(true);
    expect(par.some((id) => id.startsWith("par_"))).toBe(true);
  });

  it("all initial-setup trees are the same length, so progress stays stable", () => {
    const lengths = new Set(Object.values(TREES).map((t) => t.length));
    expect(lengths.size).toBe(1);
  });
});

describe("different intents -> different provisioned setup", () => {
  it("investor provisions the investor template on the personal org", () => {
    const p = provisioningFor("investor");
    expect(p.templateKey).toBe("investor");
    expect(p.area).toBe("personal");
    expect(p.archetype).toBe("investor");
  });

  it("founder/freelancer provision a work area (business archetype)", () => {
    expect(provisioningFor("founder").area).toBe("work");
    expect(provisioningFor("founder").archetype).toBe("business");
    expect(provisioningFor("freelancer").archetype).toBe("business");
  });

  it("family office provisions a work/office area (family_office archetype)", () => {
    expect(provisioningFor("family_office").area).toBe("work");
    expect(provisioningFor("family_office").archetype).toBe("family_office");
  });

  it("parent and renter provision their own personal templates", () => {
    expect(provisioningFor("parent").templateKey).toBe("parent");
    expect(provisioningFor("renter").templateKey).toBe("renter");
  });

  it("the (tree, templateKey, archetype) tuple is distinct across archetypes", () => {
    const tuple = (i: OnboardingIntent) =>
      `${questionTreeKey(i)}|${provisioningFor(i).templateKey}|${provisioningFor(i).archetype}`;
    const sample: OnboardingIntent[] = ["investor", "family_office", "founder", "parent", "personal"];
    const tuples = sample.map(tuple);
    expect(new Set(tuples).size).toBe(sample.length);
  });
});

describe("resolveTemplateKey", () => {
  it("passes through valid template keys", () => {
    expect(resolveTemplateKey("investor")).toBe("investor");
    expect(resolveTemplateKey("renter")).toBe("renter");
    expect(resolveTemplateKey("parent")).toBe("parent");
  });
  it("collapses anything invalid or missing to custom (no more hardcoded custom)", () => {
    expect(resolveTemplateKey("nonsense")).toBe("custom");
    expect(resolveTemplateKey("")).toBe("custom");
    expect(resolveTemplateKey(null)).toBe("custom");
    expect(resolveTemplateKey(undefined)).toBe("custom");
  });
});
