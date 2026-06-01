import { describe, it, expect } from "vitest";
import { buildAskSystemPrompt, type SpaceContext } from "@/lib/ai/agent";
import { suggestedQuestions } from "@/lib/ai/suggested-questions";

describe("buildAskSystemPrompt — space + user context", () => {
  const space: SpaceContext = {
    spaceType: "Work",
    template: "investor",
    topSections: ["Finance", "Contracts"],
    recentUploads: ["Q3 Fund Report", "Lease A"],
    language: "fr",
  };

  it("includes space type, template, sections, recent uploads, and language", () => {
    const prompt = buildAskSystemPrompt(null, space);
    expect(prompt).toContain("SPACE CONTEXT");
    expect(prompt).toContain("Work space");
    expect(prompt).toContain("investor");
    expect(prompt).toContain("Finance");
    expect(prompt).toContain("Q3 Fund Report");
    expect(prompt).toContain("fr");
  });

  it("omits the context block entirely when no context is supplied", () => {
    expect(buildAskSystemPrompt(null, null)).not.toContain("SPACE CONTEXT");
  });
});

describe("suggestedQuestions — space-aware + localized", () => {
  it("Personal and Work get different questions", () => {
    const personal = suggestedQuestions({ template: "personal" }, "en");
    const work = suggestedQuestions({ template: "business" }, "en");
    expect(personal).not.toEqual(work);
    expect(personal[0].toLowerCase()).toContain("inbox");
    expect(work.join(" ").toLowerCase()).toContain("expenses");
  });

  it("Investor and Family Office have their own buckets", () => {
    expect(suggestedQuestions({ template: "investor" }, "en").join(" ")).toContain(
      "portfolio",
    );
    expect(
      suggestedQuestions({ template: "family_office" }, "en").join(" "),
    ).toContain("renewals");
  });

  it("falls back to Work for office spaces without a template", () => {
    const work = suggestedQuestions({ parentKind: "work" }, "en");
    expect(work).toEqual(suggestedQuestions({ template: "business" }, "en"));
  });

  it("localizes into all four languages", () => {
    const en = suggestedQuestions({ template: "personal" }, "en")[0];
    for (const loc of ["ar", "fr", "es"] as const) {
      const t = suggestedQuestions({ template: "personal" }, loc)[0];
      expect(t).toBeTruthy();
      expect(t).not.toEqual(en);
    }
  });
});
