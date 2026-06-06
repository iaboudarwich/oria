/**
 * Per-user ACCENT (the brand highlight) customization. Pure module, no IO, so
 * the presets, the WCAG contrast guard, and the CSS-var resolution are
 * unit-tested and shared by the server (cookie -> inline <style>, no flash), the
 * settings control, and the live applier without divergence.
 *
 * The accent drives ONLY the brand highlight vars (--brand / --brand-soft /
 * --brand-muted / --accent-ink). The semantic DATA colors (--rec, --sleep,
 * --strain, --spend, --up, --down) are deliberately NOT touched here: a user
 * can recolor highlights, never the health/money meanings.
 */

export type AccentTheme = "dark" | "light";

export type AccentTone = { accent: string; ink: string };

export type AccentPreset = {
  key: string;
  /** Each theme carries its own tuned accent + ink so both always read AA. */
  dark: AccentTone;
  light: AccentTone;
};

/**
 * Curated premium presets. Each is hand-tuned per theme so the accent is
 * legible on the near-black AND the warm off-white surface, and the ink on the
 * accent fill clears AA. Mint is the default and matches the v3 globals tokens
 * exactly, so the shipped look is unchanged until a user chooses otherwise.
 */
export const ACCENT_PRESETS: AccentPreset[] = [
  {
    key: "mint",
    dark: { accent: "#4FE3AC", ink: "#04130D" },
    light: { accent: "#0E9E70", ink: "#FFFFFF" },
  },
  {
    key: "teal",
    dark: { accent: "#3FD0E3", ink: "#04181C" },
    light: { accent: "#0E8F9E", ink: "#FFFFFF" },
  },
  {
    key: "indigo",
    dark: { accent: "#9D9DFF", ink: "#0B0B2A" },
    light: { accent: "#4F46E5", ink: "#FFFFFF" },
  },
  {
    key: "violet",
    dark: { accent: "#C39DFF", ink: "#1E0B33" },
    light: { accent: "#7C3AED", ink: "#FFFFFF" },
  },
  {
    key: "amber",
    dark: { accent: "#F2B441", ink: "#1A1303" },
    light: { accent: "#B5790C", ink: "#FFFFFF" },
  },
  {
    key: "coral",
    dark: { accent: "#F2685C", ink: "#2A0A07" },
    light: { accent: "#D8493C", ink: "#FFFFFF" },
  },
  {
    key: "slate",
    dark: { accent: "#A8AEB8", ink: "#0B0D10" },
    light: { accent: "#5C6470", ink: "#FFFFFF" },
  },
];

export const DEFAULT_ACCENT = "mint";

const PRESET_BY_KEY = new Map(ACCENT_PRESETS.map((p) => [p.key, p]));

/** The reference surfaces the accent must stand on, per theme (globals.css). */
const SURFACE: Record<AccentTheme, string> = { dark: "#15181C", light: "#FFFFFF" };

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function isHex6(v: unknown): v is string {
  return typeof v === "string" && HEX6.test(v.trim());
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.trim().replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0..1). */
export function relLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio (1..21) between two hex colors. */
export function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick black or white for max contrast on an accent fill (the ink). */
export function inkFor(accentHex: string): string {
  const black = "#0A0A0A";
  const white = "#FFFFFF";
  return contrastRatio(accentHex, black) >= contrastRatio(accentHex, white) ? black : white;
}

/** Brand-soft / muted tint: the accent at low alpha, for chip/hover fills. */
function dimFor(accentHex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(accentHex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type AccentValidation =
  | { ok: true }
  | { ok: false; reason: "format" | "dark_contrast" | "light_contrast" | "no_ink" };

/**
 * The accent is a brand HIGHLIGHT: its fill carries bold button labels and UI
 * components, so the governing WCAG floor is AA for large text / non-text UI,
 * 3:1, not the 4.5:1 body-text rule (which still governs ordinary copy on
 * surfaces, untouched here). The shipped mint default reads white-on-green at
 * ~3.4:1, so 3:1 keeps that default intact while still rejecting truly
 * illegible custom colors.
 */
const ACCENT_MIN = 3;

/**
 * Validate a CUSTOM accent hex against AA in BOTH themes:
 *  - the accent must stand off each theme's surface (>= 3:1), and
 *  - some ink (black or white) must clear 3:1 on the accent fill.
 * Presets skip this (they are pre-tuned); only custom hex is guarded.
 */
export function validateAccentHex(hex: string): AccentValidation {
  if (!isHex6(hex)) return { ok: false, reason: "format" };
  if (contrastRatio(hex, SURFACE.dark) < ACCENT_MIN) return { ok: false, reason: "dark_contrast" };
  if (contrastRatio(hex, SURFACE.light) < ACCENT_MIN)
    return { ok: false, reason: "light_contrast" };
  const bestInk = Math.max(contrastRatio(hex, "#0A0A0A"), contrastRatio(hex, "#FFFFFF"));
  if (bestInk < ACCENT_MIN) return { ok: false, reason: "no_ink" };
  return { ok: true };
}

/** Coerce a stored value to a usable accent value (preset key or valid hex). */
export function coerceAccent(v: unknown): string {
  if (typeof v === "string") {
    if (PRESET_BY_KEY.has(v)) return v;
    if (isHex6(v) && validateAccentHex(v).ok) return v;
  }
  return DEFAULT_ACCENT;
}

/** Resolve a stored value + theme to the concrete accent/ink for that theme. */
export function accentTone(value: string, theme: AccentTheme): AccentTone {
  const preset = PRESET_BY_KEY.get(value);
  if (preset) return preset[theme];
  if (isHex6(value)) return { accent: value, ink: inkFor(value) };
  return PRESET_BY_KEY.get(DEFAULT_ACCENT)![theme];
}

/**
 * The CSS the server injects (and the client live-replaces) to drive the accent
 * for BOTH themes at once, so switching theme keeps the accent and there is no
 * flash. Only brand-highlight vars; data colors are never emitted here.
 */
export function accentStyleCss(value: string): string {
  const v = coerceAccent(value);
  const d = accentTone(v, "dark");
  const l = accentTone(v, "light");
  const rule = (tone: AccentTone) =>
    `--brand:${tone.accent};--brand-soft:${dimFor(tone.accent, 0.13)};--brand-muted:${dimFor(tone.accent, 0.1)};--accent-ink:${tone.ink};--shadow-brand:0 0 0 3px ${dimFor(tone.accent, 0.18)}`;
  return `:root,.dark{${rule(d)}}.light{${rule(l)}}`;
}
