import "server-only";

import { cookies } from "next/headers";
import {
  coerceDensity,
  coerceFontSize,
  DEFAULT_APPEARANCE,
  type Appearance,
} from "@/lib/appearance/prefs";
import { coerceAccent } from "@/lib/appearance/accent";

// Appearance is mirrored to cookies so the dashboard shell can apply it on the
// first server paint (no flash of the wrong size), exactly like the sidebar
// width/mode prefs. user_preferences stays the durable, cross-device record.
export const DENSITY_COOKIE = "oria_density";
export const FONT_SIZE_COOKIE = "oria_font";
// The accent (brand highlight) is read at the ROOT layout to inject the accent
// <style> before paint, so it is app-wide (auth pages too), not just dashboard.
export const ACCENT_COOKIE = "oria_accent";
// Theme is owned live by next-themes (localStorage, no-flash); this cookie is
// the durable mirror for the record, kept in lockstep by the action.
export const THEME_COOKIE = "oria_theme";

/** The stored accent value (preset key or hex) for this request, default mint. */
export async function readAccent(): Promise<string> {
  const jar = await cookies();
  return coerceAccent(jar.get(ACCENT_COOKIE)?.value);
}

/**
 * Read the appearance preference from cookies for the current request. Cheap,
 * no DB round-trip, FOUC-free. Missing or invalid cookies fall back to the
 * defaults (Comfortable, default size).
 */
export async function readAppearance(): Promise<Appearance> {
  const jar = await cookies();
  const density = jar.get(DENSITY_COOKIE)?.value;
  const fontSize = jar.get(FONT_SIZE_COOKIE)?.value;
  if (density === undefined && fontSize === undefined) return DEFAULT_APPEARANCE;
  return {
    density: coerceDensity(density),
    fontSize: coerceFontSize(fontSize),
  };
}
