// Per-space theming. Resolves a space's accent + shadow into the CSS custom
// properties the whole dashboard reads (--brand, --brand-soft, --brand-muted,
// --shadow-brand, --shadow-color). Pure and dependency-free so it's testable
// and can run in a server component without a render cost.

export type ThemeColors = {
  brand: string;
  brandSoft: string;
  brandMuted: string;
  shadow: string;
};

/** Preset palette offered in the Appearance picker. */
export const PRESET_ACCENTS: Array<{ key: string; label: string; hex: string }> = [
  { key: "blue", label: "Blue", hex: "#4F7CF0" },
  { key: "teal", label: "Teal", hex: "#2BA6A4" },
  { key: "green", label: "Green", hex: "#2F9E6B" },
  { key: "amber", label: "Amber", hex: "#C99A2E" },
  { key: "orange", label: "Orange", hex: "#D9772E" },
  { key: "red", label: "Red", hex: "#C0494B" },
  { key: "purple", label: "Purple", hex: "#7A5BD6" },
  { key: "slate", label: "Slate", hex: "#6B6F86" },
];

// Per-template defaults. Subtle but distinguishable.
const TEMPLATE_DEFAULT: Record<string, string> = {
  personal: "#5B7CDD", // soft blue
  business: "#2E3A6E", // navy
  investor: "#2F9E6B", // deep green
  family_office: "#8E3B4E", // bordeaux
  custom: "#6B6F86", // warm slate
};
const WORK_DEFAULT = "#6B6F86"; // warm slate (the default "My Work" workspace)
const PERSONAL_DEFAULT = "#5B7CDD"; // soft blue

function isHex(v: string | null | undefined): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim());
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.trim().replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Default accent for a space when it hasn't set an explicit one. */
export function defaultAccentFor(org: {
  parent_kind?: "personal" | "work";
  kind?: string;
  template_key?: string | null;
}): string {
  if (org.template_key && TEMPLATE_DEFAULT[org.template_key]) {
    return TEMPLATE_DEFAULT[org.template_key];
  }
  const isWork = org.parent_kind === "work" || org.kind === "office";
  return isWork ? WORK_DEFAULT : PERSONAL_DEFAULT;
}

/** Derive the full set of theme colors from an accent hex (+ optional shadow). */
export function deriveTheme(accentHex: string, shadowHex?: string | null): ThemeColors {
  const brand = isHex(accentHex) ? accentHex : PERSONAL_DEFAULT;
  const { r, g, b } = hexToRgb(brand);
  // Soft = a pale tint (12% brand over white), used for chip/hover backgrounds.
  const sr = Math.round(r * 0.12 + 255 * 0.88);
  const sg = Math.round(g * 0.12 + 255 * 0.88);
  const sb = Math.round(b * 0.12 + 255 * 0.88);
  const s = isHex(shadowHex ?? null) ? hexToRgb(shadowHex as string) : { r, g, b };
  return {
    brand,
    brandSoft: `rgb(${sr}, ${sg}, ${sb})`,
    brandMuted: `rgba(${r}, ${g}, ${b}, 0.12)`,
    shadow: `rgba(${s.r}, ${s.g}, ${s.b}, 0.18)`,
  };
}

export function resolveSpaceTheme(org: {
  parent_kind?: "personal" | "work";
  kind?: string;
  template_key?: string | null;
  accent_color?: string | null;
  shadow_color?: string | null;
}): ThemeColors {
  const accent = isHex(org.accent_color) ? org.accent_color : defaultAccentFor(org);
  return deriveTheme(accent as string, org.shadow_color);
}

/** Build the inline style object that pins the theme vars on a wrapper. */
export function themeCssVars(t: ThemeColors): Record<string, string> {
  return {
    "--brand": t.brand,
    "--brand-soft": t.brandSoft,
    "--brand-muted": t.brandMuted,
    "--shadow-brand": `0 0 0 3px ${t.shadow}`,
    "--shadow-color": t.shadow,
  };
}
