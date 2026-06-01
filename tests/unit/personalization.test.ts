import { describe, it, expect } from "vitest";
import {
  buildPersonalizationContext,
  personalContextBlock,
  personalizeQuestions,
} from "@/lib/ai/personalization";
import { buildAskSystemPrompt } from "@/lib/ai/agent";
import type { UserProfile } from "@/lib/data/user-profile";

const heavyBillsShort: UserProfile = {
  preferences: {
    responseLength: "short",
    formality: "professional",
    focusAreas: ["bills"],
    pinnedMetrics: ["monthly spend"],
  },
  derived: {
    topSections: [
      { key: "bills", count: 20 },
      { key: "finance", count: 5 },
      { key: "travel", count: 2 },
      { key: "health", count: 1 },
    ],
    avgQueryLength: 30,
    preferredTime: "morning",
    reminderDismissalRate: 0.1,
    totalSignals: 40,
  },
};

describe("buildPersonalizationContext", () => {
  it("maps short -> 80 words, professional -> neutral, top 3 sections", () => {
    const pc = buildPersonalizationContext(heavyBillsShort);
    expect(pc.responseWords).toBe(80);
    expect(pc.tone).toBe("neutral");
    expect(pc.topSections).toEqual(["bills", "finance", "travel"]);
    expect(pc.focusAreas).toEqual(["bills"]);
    expect(pc.pinnedMetrics).toEqual(["monthly spend"]);
  });

  it("maps medium -> 200 and long -> 400, casual -> warm", () => {
    const med = buildPersonalizationContext({
      ...heavyBillsShort,
      preferences: { ...heavyBillsShort.preferences, responseLength: "medium", formality: "casual" },
    });
    expect(med.responseWords).toBe(200);
    expect(med.tone).toBe("warm");
    const long = buildPersonalizationContext({
      ...heavyBillsShort,
      preferences: { ...heavyBillsShort.preferences, responseLength: "long" },
    });
    expect(long.responseWords).toBe(400);
  });
});

describe("personalContextBlock + buildAskSystemPrompt", () => {
  it("the prompt carries the personalization tokens", () => {
    const pc = buildPersonalizationContext(heavyBillsShort);
    const block = personalContextBlock(pc);
    const prompt = buildAskSystemPrompt(null, null, block);
    expect(prompt).toContain("PERSONAL CONTEXT");
    expect(prompt).toContain("80 words");
    expect(prompt).toContain("neutral");
    expect(prompt).toContain("bills");
    expect(prompt).toContain("monthly spend");
  });

  it("omits the personal block when none is supplied", () => {
    expect(buildAskSystemPrompt(null, null)).not.toContain("PERSONAL CONTEXT");
  });
});

describe("personalizeQuestions", () => {
  it("weights suggestions toward the user's top engaged section", () => {
    const base = [
      "What are our highest recurring expenses?",
      "Summarize this quarter's reports",
      "Which contracts are renewing?",
    ];
    const out = personalizeQuestions(base, ["bills", "finance"], "en");
    expect(out[0].toLowerCase()).toContain("bill");
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it("returns the base list when no top section maps to a question", () => {
    const base = ["A", "B"];
    expect(personalizeQuestions(base, ["legal"], "en")).toEqual(["A", "B"]);
  });
});
