/**
 * Per-user appearance preferences: density and font size (Round 14.8 F1).
 *
 * Pure module on purpose, no server-only, no next/headers, no SDK, so the
 * clamps and the scale map can be unit-tested in plain node and imported by
 * both the server cookie reader (lib/data/appearance-prefs.ts) and the client
 * control (components/settings/display-panel.tsx) without divergence.
 *
 * Density follows heuristics §1.14 (Comfortable default, or Compact). Font size
 * is the accessibility text-resize control: four steps, applied as a CSS
 * --font-scale multiplier on the dashboard shell so the design-system type
 * utilities scale together without breaking layout.
 */

export const DENSITY_VALUES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITY_VALUES)[number];
export const DEFAULT_DENSITY: Density = "comfortable";

export const FONT_SIZE_VALUES = ["small", "default", "large", "xlarge"] as const;
export type FontSize = (typeof FONT_SIZE_VALUES)[number];
export const DEFAULT_FONT_SIZE: FontSize = "default";

/** The multiplier applied as --font-scale for each step. Kept gentle so the
 *  largest step (1.25) still fits the existing layouts; 200% browser zoom
 *  remains available on top for users who need more. */
export const FONT_SCALE: Record<FontSize, number> = {
  small: 0.92,
  default: 1,
  large: 1.12,
  xlarge: 1.25,
};

/** Coerce any value to a valid Density, falling back to the default. */
export function coerceDensity(v: unknown): Density {
  return (DENSITY_VALUES as readonly string[]).includes(v as string)
    ? (v as Density)
    : DEFAULT_DENSITY;
}

/** Coerce any value to a valid FontSize, falling back to the default. */
export function coerceFontSize(v: unknown): FontSize {
  return (FONT_SIZE_VALUES as readonly string[]).includes(v as string)
    ? (v as FontSize)
    : DEFAULT_FONT_SIZE;
}

/** Resolve the numeric --font-scale for a font-size step (default 1). */
export function fontScaleFor(size: unknown): number {
  return FONT_SCALE[coerceFontSize(size)];
}

export type Appearance = { density: Density; fontSize: FontSize };

export const DEFAULT_APPEARANCE: Appearance = {
  density: DEFAULT_DENSITY,
  fontSize: DEFAULT_FONT_SIZE,
};
