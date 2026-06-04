import { describe, it, expect } from "vitest";
import {
  coerceDensity,
  coerceFontSize,
  fontScaleFor,
  FONT_SCALE,
  FONT_SIZE_VALUES,
  DENSITY_VALUES,
  DEFAULT_APPEARANCE,
} from "@/lib/appearance/prefs";

/**
 * F1 persistence guard (Round 14.8). The clamps are the boundary between
 * untrusted input (cookie value, form field) and the data attributes that drive
 * the appearance CSS, so they must never let an invalid value through.
 */

describe("coerceDensity", () => {
  it("passes valid values", () => {
    for (const v of DENSITY_VALUES) expect(coerceDensity(v)).toBe(v);
  });
  it("falls back to comfortable on anything invalid", () => {
    for (const bad of ["", "cozy", null, undefined, 1, {}, "COMPACT"]) {
      expect(coerceDensity(bad)).toBe("comfortable");
    }
  });
});

describe("coerceFontSize", () => {
  it("passes valid values", () => {
    for (const v of FONT_SIZE_VALUES) expect(coerceFontSize(v)).toBe(v);
  });
  it("falls back to default on anything invalid", () => {
    for (const bad of ["", "huge", null, undefined, 2, "Large"]) {
      expect(coerceFontSize(bad)).toBe("default");
    }
  });
});

describe("fontScaleFor", () => {
  it("maps each step to its scale", () => {
    expect(fontScaleFor("small")).toBe(0.92);
    expect(fontScaleFor("default")).toBe(1);
    expect(fontScaleFor("large")).toBe(1.12);
    expect(fontScaleFor("xlarge")).toBe(1.25);
  });
  it("returns the default scale (1) for invalid input", () => {
    expect(fontScaleFor("nonsense")).toBe(1);
  });
  it("scales strictly increase across the steps", () => {
    const scales = FONT_SIZE_VALUES.map((v) => FONT_SCALE[v]);
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeGreaterThan(scales[i - 1]);
    }
  });
});

describe("defaults", () => {
  it("are comfortable + default", () => {
    expect(DEFAULT_APPEARANCE).toEqual({ density: "comfortable", fontSize: "default" });
  });
});
