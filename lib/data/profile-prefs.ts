"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Persist the user's IANA timezone and UI locale onto their profile. The
 * client knows both (Intl + the active locale); the daily-loop cron needs them
 * server-side to schedule per-user-local routines and to localize generic push
 * bodies. Best-effort and idempotent. RLS scopes the write to the caller.
 */
export async function syncLocaleTimezone(timezone: string, locale: string): Promise<void> {
  try {
    if (!timezone) return;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ timezone, locale: locale.slice(0, 5) })
      .eq("id", user.id);
  } catch {
    // Best-effort: scheduling falls back to UTC / en if this never lands.
  }
}
