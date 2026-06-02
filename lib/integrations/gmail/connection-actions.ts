"use server";

import { createClient } from "@/lib/supabase/server";
import { setGmailConnectionStatus } from "./connections";

/**
 * Pause or resume the user's Gmail sync. Paused connections are skipped by the
 * sync cron until resumed. No token material is touched.
 */
export async function setGmailPaused(paused: boolean): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  await setGmailConnectionStatus(user.id, paused ? "paused" : "active");
  return { ok: true };
}
