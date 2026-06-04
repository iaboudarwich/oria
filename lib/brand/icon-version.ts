/**
 * Icon cache-busting version.
 *
 * Bump this whenever the icon assets in public/icons (+ app/favicon.ico) change
 * so browsers, the web manifest, and the service worker all re-fetch instead of
 * serving a stale cached icon. The filenames stay the same (so references keep
 * resolving); the ?v= query is what forces the refresh.
 *
 * KEEP IN SYNC: public/sw.js has its own VERSION constant (it is plain JS and
 * cannot import this). Bump both together.
 *
 * LIMIT (see the Part 3 report): an already-installed app caches its icon at
 * INSTALL time at the OS level. Versioning refreshes browser tabs and, over
 * time, Android and desktop installed PWAs. It does NOT refresh an icon already
 * on the iOS Home Screen or the macOS dock; those only update after the app is
 * removed and re-added.
 */
export const ICON_VERSION = "3";

/** Append the icon cache-busting version to a static icon path. */
export function versionedIcon(path: string): string {
  return `${path}?v=${ICON_VERSION}`;
}
