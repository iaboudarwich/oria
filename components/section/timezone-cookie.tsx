"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { syncLocaleTimezone } from "@/lib/data/profile-prefs";

/**
 * Writes the user's IANA timezone into a long-lived cookie so server
 * components can compute correct day boundaries for "today" / "this
 * week" filters (Diet, Bills, Calendar). Re-writes on every dashboard
 * mount in case the user travels.
 *
 * Also persists timezone + locale onto the profile (server-side) so the
 * daily-loop cron, which has no request session, can schedule per-user-local
 * routines and localize push bodies. Persisted only when the value changes
 * (tracked in localStorage) so it is not written on every mount.
 *
 * Cheap. no network on the common path, no state, no re-render after mount.
 */
export function TimezoneCookie() {
  const locale = useLocale();
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const oneYear = 60 * 60 * 24 * 365;
      document.cookie = `oria_tz=${encodeURIComponent(tz)}; path=/; max-age=${oneYear}; samesite=lax`;

      const marker = `${tz}|${locale}`;
      if (localStorage.getItem("oria_tz_synced") !== marker) {
        void syncLocaleTimezone(tz, locale).then(() => {
          try {
            localStorage.setItem("oria_tz_synced", marker);
          } catch {
            // ignore
          }
        });
      }
    } catch {
      // No-op. fallback to UTC server-side.
    }
  }, [locale]);
  return null;
}
