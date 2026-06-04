import "server-only";

import { cookies } from "next/headers";
import {
  coerceDensity,
  coerceFontSize,
  DEFAULT_APPEARANCE,
  type Appearance,
} from "@/lib/appearance/prefs";

// Appearance is mirrored to cookies so the dashboard shell can apply it on the
// first server paint (no flash of the wrong size), exactly like the sidebar
// width/mode prefs. user_preferences stays the durable, cross-device record.
export const DENSITY_COOKIE = "oria_density";
export const FONT_SIZE_COOKIE = "oria_font";

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
