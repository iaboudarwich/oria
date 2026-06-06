import { describe, it, expect } from "vitest";
import { resolveThingsLabel } from "@/lib/data/things-label";

describe("resolveThingsLabel", () => {
  it("uses a custom label when set", () => {
    expect(resolveThingsLabel({ things_label: "Stuff", template_key: "investor" })).toBe("Stuff");
  });

  it("trims and ignores blank custom labels", () => {
    expect(resolveThingsLabel({ things_label: "  ", template_key: "investor" })).toBe("Assets");
  });

  it("defaults to Assets for the asset-heavy investor template", () => {
    expect(resolveThingsLabel({ template_key: "investor" })).toBe("Assets");
  });

  it("defaults to Records for custom/unknown/null (Round 14: Things -> Items -> Records; the Trackables noun belongs to the separate renewals feature)", () => {
    expect(resolveThingsLabel({ template_key: "custom" })).toBe("Records");
    expect(resolveThingsLabel({ template_key: "teacher" })).toBe("Records");
    expect(resolveThingsLabel({})).toBe("Records");
    expect(resolveThingsLabel({ template_key: null })).toBe("Records");
  });
});
