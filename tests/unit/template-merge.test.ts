import { describe, it, expect } from "vitest";
import {
  mergeTemplatesForApply,
  resolveStoredTemplateKey,
  WORKSPACE_TEMPLATES,
} from "@/lib/data/workspace-templates";

/**
 * Multi-template merge (Feature 4) — pure logic only, no DB.
 *
 * The picker becomes multi-select; these tests pin the merge rules the
 * applyTemplates() server function relies on so a regression couldn't
 * silently seed duplicates or strip a delegation-prominent template.
 */

describe("mergeTemplatesForApply — section dedup", () => {
  it("returns nothing when no templates are picked", () => {
    const out = mergeTemplatesForApply([]);
    expect(out.sections).toEqual([]);
    expect(out.entityTypes).toEqual([]);
    expect(out.delegationProminent).toBe(false);
  });

  it("contributes the full section list for a single real template", () => {
    const personal = WORKSPACE_TEMPLATES.find((t) => t.key === "personal")!;
    const out = mergeTemplatesForApply(["personal"]);
    expect(out.sections.map((s) => s.name)).toEqual(
      personal.section_seeds.map((s) => s.name),
    );
  });

  it("contributes nothing for the custom / skip template", () => {
    const out = mergeTemplatesForApply(["custom"]);
    expect(out.sections).toEqual([]);
    expect(out.entityTypes).toEqual([]);
  });

  it("de-dupes overlapping section names by case-insensitive name (first wins)", () => {
    // Personal and Family Office both seed "Travel". With Personal first,
    // Personal's "Travel" must be the one that survives.
    const out = mergeTemplatesForApply(["personal", "family_office"]);
    const travels = out.sections.filter((s) => s.name.toLowerCase() === "travel");
    expect(travels).toHaveLength(1);
    expect(travels[0].sort_order).toBe(20); // Personal's Travel order, not 40
  });

  it("preserves the order of the user's selection", () => {
    const out = mergeTemplatesForApply(["family_office", "personal"]);
    const familyFirstIdx = out.sections.findIndex((s) => s.name === "Properties");
    const personalFirstIdx = out.sections.findIndex((s) => s.name === "Bills");
    // Properties is family_office's first section; it must come before
    // any personal-only section in the merged list.
    expect(familyFirstIdx).toBeGreaterThanOrEqual(0);
    expect(personalFirstIdx).toBeGreaterThan(familyFirstIdx);
  });

  it("is idempotent if the same template is passed twice", () => {
    const single = mergeTemplatesForApply(["personal"]);
    const doubled = mergeTemplatesForApply(["personal", "personal"]);
    expect(doubled.sections).toEqual(single.sections);
    expect(doubled.entityTypes).toEqual(single.entityTypes);
  });

  it("ignores custom mixed in with real picks", () => {
    const justPersonal = mergeTemplatesForApply(["personal"]);
    const withCustom = mergeTemplatesForApply(["personal", "custom"]);
    expect(withCustom.sections).toEqual(justPersonal.sections);
  });
});

describe("mergeTemplatesForApply — entity-type dedup", () => {
  it("merges entity types from multiple templates and dedupes by key (first wins)", () => {
    // Personal + Family Office both seed `vehicle`, `property`, `person`.
    // First-occurrence wins → those keys come from Personal's seed list.
    const out = mergeTemplatesForApply(["personal", "family_office"]);
    const keys = out.entityTypes.map((et) => et.key);
    // No duplicates anywhere.
    expect(new Set(keys).size).toBe(keys.length);
    // Family Office's unique entity types still come through.
    expect(keys).toContain("investment");
    expect(keys).toContain("collection");
    // Shared keys are present exactly once.
    expect(keys.filter((k) => k === "vehicle")).toHaveLength(1);
    expect(keys.filter((k) => k === "property")).toHaveLength(1);
  });

  it("returns no entity types for custom-only selection", () => {
    expect(mergeTemplatesForApply(["custom"]).entityTypes).toEqual([]);
  });
});

describe("mergeTemplatesForApply — delegation_prominent OR-merge", () => {
  it("is false when no template flagged delegation_prominent", () => {
    expect(mergeTemplatesForApply(["personal"]).delegationProminent).toBe(false);
    expect(mergeTemplatesForApply(["custom"]).delegationProminent).toBe(false);
  });

  it("is true when any selected template is flagged", () => {
    expect(mergeTemplatesForApply(["investor"]).delegationProminent).toBe(true);
    expect(
      mergeTemplatesForApply(["personal", "investor"]).delegationProminent,
    ).toBe(true);
    expect(
      mergeTemplatesForApply(["personal", "family_office"]).delegationProminent,
    ).toBe(true);
  });
});

describe("resolveStoredTemplateKey", () => {
  it("stamps the chosen key when exactly one real template is picked", () => {
    expect(resolveStoredTemplateKey(["personal"])).toBe("personal");
    expect(resolveStoredTemplateKey(["investor"])).toBe("investor");
    expect(resolveStoredTemplateKey(["family_office"])).toBe("family_office");
  });

  it("collapses to 'custom' when multiple real templates are picked", () => {
    expect(resolveStoredTemplateKey(["personal", "investor"])).toBe("custom");
    expect(
      resolveStoredTemplateKey(["personal", "investor", "family_office"]),
    ).toBe("custom");
  });

  it("collapses to 'custom' on Skip / empty selection", () => {
    expect(resolveStoredTemplateKey([])).toBe("custom");
    expect(resolveStoredTemplateKey(["custom"])).toBe("custom");
  });

  it("treats a 'custom' value mixed with one real key as that one key", () => {
    expect(resolveStoredTemplateKey(["personal", "custom"])).toBe("personal");
  });
});
