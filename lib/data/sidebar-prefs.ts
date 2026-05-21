import "server-only";

import { cookies } from "next/headers";

export const SIDEBAR_COOKIE = "oria_sidebar";
export const SECTIONS_COOKIE = "oria_sections";
export const SIDEBAR_WIDTH_COOKIE = "oria_sidebar_w";
export const SIDEBAR_EXTRAS_COOKIE = "oria_sidebar_extras";

/** Opt-in sidebar items the user can toggle on. Keep the union small —
 *  every entry here is a row that lives off-by-default to keep the
 *  sidebar uncluttered for the median user. */
export type SidebarExtra = "timeline";

const ALLOWED_EXTRAS: SidebarExtra[] = ["timeline"];

export type SidebarMode = "expanded" | "collapsed";
export type SectionsMode = "open" | "closed";

export const SIDEBAR_DEFAULT_WIDTH = 250;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 420;

/**
 * Read the sidebar collapsed/expanded preference. Client writes the cookie
 * directly via document.cookie on toggle so the next render picks it up.
 */
export async function readSidebarMode(): Promise<SidebarMode> {
  const v = (await cookies()).get(SIDEBAR_COOKIE)?.value;
  return v === "collapsed" ? "collapsed" : "expanded";
}

/**
 * Read the Sections-group open/closed preference. Default is open: most
 * users want to see their sections at a glance until they explicitly
 * collapse them.
 */
export async function readSectionsMode(): Promise<SectionsMode> {
  const v = (await cookies()).get(SECTIONS_COOKIE)?.value;
  return v === "closed" ? "closed" : "open";
}

/**
 * Read the user-resized sidebar width. Returns a clamped pixel value, or
 * the default when no preference is set. Client writes via document.cookie
 * on pointer-up of the drag handle so it survives reload.
 */
export async function readSidebarWidth(): Promise<number> {
  const v = (await cookies()).get(SIDEBAR_WIDTH_COOKIE)?.value;
  if (!v) return SIDEBAR_DEFAULT_WIDTH;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, n));
}

/**
 * Read which optional sidebar items the user has opted into. Stored as
 * a comma-separated cookie because the values are short and we want to
 * stay parse-cheap. Unknown values are silently dropped, so a stale
 * cookie can't drag a removed entry back in.
 */
export async function readSidebarExtras(): Promise<Set<SidebarExtra>> {
  const v = (await cookies()).get(SIDEBAR_EXTRAS_COOKIE)?.value;
  if (!v) return new Set();
  const allowed = new Set<SidebarExtra>(ALLOWED_EXTRAS);
  const picked = v
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is SidebarExtra => (allowed as Set<string>).has(s));
  return new Set(picked);
}
