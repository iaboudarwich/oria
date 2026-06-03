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
      resolveThingsLabel({ things_label: "  ", template_key: "investor" }),
    ).toBe("Assets");
  });

  it("defaults to Assets for the asset-heavy investor template", () => {
    expect(resolveThingsLabel({ template_key: "investor" })).toBe("Assets");
  });

  it("defaults to Items for custom/unknown/null (renamed from Things in Round 14)", () => {
    expect(resolveThingsLabel({ template_key: "custom" })).toBe("Items");
    expect(resolveThingsLabel({ template_key: "teacher" })).toBe("Items");
    expect(resolveThingsLabel({})).toBe("Items");
    expect(resolveThingsLabel({ template_key: null })).toBe("Items");
  });
});
