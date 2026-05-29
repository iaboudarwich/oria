"use client";

import { useEffect } from "react";

/**
 * Writes the user's IANA timezone into a long-lived cookie so server
 * components can compute correct day boundaries for "today" / "this
 * week" filters (Diet, Bills, Calendar). Re-writes on every dashboard
 * mount in case the user travels.
 *
 * Cheap. no network, no state, no re-render after mount.
 */
export function TimezoneCookie() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const oneYear = 60 * 60 * 24 * 365;
      document.cookie = `oria_tz=${encodeURIComponent(tz)}; path=/; max-age=${oneYear}; samesite=lax`;
    } catch {
      // No-op. fallback to UTC server-side.
    }
  }, []);
  return null;
}
