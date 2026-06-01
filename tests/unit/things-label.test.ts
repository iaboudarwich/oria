import { describe, it, expect } from "vitest";
import { resolveThingsLabel } from "@/lib/data/things-label";

describe("resolveThingsLabel", () => {
  it("uses a custom label when set", () => {
    expect(
      resolveThingsLabel({ things_label: "Stuff", template_key: "investor" }),
    ).toBe("Stuff");
  });

  it("trims and ignores blank custom labels", () => {
    expect(
      resolveThingsLabel({ things_label: "  ", template_key: "business" }),
    ).toBe("Assets");
  });

  it("defaults to Assets for asset-heavy templates", () => {
    expect(resolveThingsLabel({ template_key: "investor" })).toBe("Assets");
    expect(resolveThingsLabel({ template_key: "business" })).toBe("Assets");
    expect(resolveThingsLabel({ template_key: "family_office" })).toBe("Assets");
  });

  it("defaults to Things for personal/custom/unknown", () => {
    expect(resolveThingsLabel({ template_key: "personal" })).toBe("Things");
    expect(resolveThingsLabel({ template_key: "custom" })).toBe("Things");
    expect(resolveThingsLabel({})).toBe("Things");
    expect(resolveThingsLabel({ template_key: null })).toBe("Things");
  });
});
