import { describe, it, expect } from "vitest";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  contrastRatio,
  inkFor,
  validateAccentHex,
  coerceAccent,
  accentTone,
  accentStyleCss,
} from "@/lib/appearance/accent";

/**
 * The accent system lets a user recolor the brand highlight, so the contrast
 * guard is the safety net: a custom color that fails AA in either theme must be
 * rejected, and every shipped preset must itself pass. These guard that, plus
 * that the style block only ever emits brand vars (never a data color).
 */

describe("accent presets", () => {
  it("mint is the default and matches the v3 tokens", () => {
    expect(DEFAULT_ACCENT).toBe("mint");
    const mint = ACCENT_PRESETS.find((p) => p.key === "mint")!;
    expect(mint.dark.accent).toBe("#4FE3AC");
    expect(mint.light.accent).toBe("#0E9E70");
  });

  it("every preset's ink clears the accent floor (3:1, large/UI) both themes", () => {
    for (const p of ACCENT_PRESETS) {
      expect(contrastRatio(p.dark.accent, p.dark.ink)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(p.light.accent, p.light.ink)).toBeGreaterThanOrEqual(3);
    }
  });

  it("every preset stands off both surfaces (>= 3:1)", () => {
    for (const p of ACCENT_PRESETS) {
      expect(contrastRatio(p.dark.accent, "#15181C")).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(p.light.accent, "#FFFFFF")).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("contrast guard for custom hex", () => {
  it("rejects a non-hex", () => {
    expect(validateAccentHex("mint")).toEqual({ ok: false, reason: "format" });
    expect(validateAccentHex("#abc")).toEqual({ ok: false, reason: "format" });
  });

  it("rejects a too-dark color (invisible on the dark surface)", () => {
    expect(validateAccentHex("#0c0d10")).toMatchObject({ ok: false });
  });

  it("rejects a too-light color (invisible on the light surface)", () => {
    expect(validateAccentHex("#fefefe")).toMatchObject({ ok: false });
  });

  it("accepts a balanced mid-tone", () => {
    expect(validateAccentHex("#4F7CF0")).toEqual({ ok: true });
  });
});

describe("ink + coercion + style", () => {
  it("inkFor picks the higher-contrast of black/white", () => {
    expect(contrastRatio("#4FE3AC", inkFor("#4FE3AC"))).toBeGreaterThanOrEqual(3);
  });

  it("coerceAccent keeps presets and valid hex, else falls back to default", () => {
    expect(coerceAccent("teal")).toBe("teal");
    expect(coerceAccent("#4F7CF0")).toBe("#4F7CF0");
    expect(coerceAccent("#000000")).toBe(DEFAULT_ACCENT); // fails contrast
    expect(coerceAccent("nonsense")).toBe(DEFAULT_ACCENT);
    expect(coerceAccent(null)).toBe(DEFAULT_ACCENT);
  });

  it("accentTone resolves per theme for a preset and a custom hex", () => {
    expect(accentTone("mint", "dark").accent).toBe("#4FE3AC");
    expect(accentTone("mint", "light").accent).toBe("#0E9E70");
    expect(accentTone("#4F7CF0", "dark").accent).toBe("#4F7CF0");
  });

  it("accentStyleCss emits only brand vars for both themes, never a data color", () => {
    const css = accentStyleCss("teal");
    expect(css).toContain(":root,.dark{");
    expect(css).toContain(".light{");
    expect(css).toContain("--brand:");
    expect(css).toContain("--accent-ink:");
    expect(css).not.toContain("--rec");
    expect(css).not.toContain("--spend");
    expect(css).not.toContain("--sleep");
  });
});
