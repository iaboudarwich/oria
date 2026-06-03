"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/data/organizations";
import { logAuditEvent } from "@/lib/data/audit-log";
import type { CalendarSourcePrefs } from "./calendar-types";

/**
 * Persist the calendar source filter for the current user (Round 14.5 F3).
 * Upsert touches only calendar_sources, so the other preference columns are
 * preserved. RLS scopes the write to the user's own row. Audited as a
 * preference write.
 */
export async function setCalendarSources(prefs: CalendarSourcePrefs): Promise<void> {
  const ctx = await getCurrentContext();
  if (!ctx) return;
  // Normalise to known keys so a forged payload can't write arbitrary JSON.
  const clean: CalendarSourcePrefs = {
    events: prefs.events !== false,
    reminders: prefs.reminders !== false,
    bills: prefs.bills !== false,
  };
  const supabase = await createClient();
  await supabase
    .from("user_preferences")
    .upsert(
      { user_id: ctx.profile.id, calendar_sources: clean, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  void logAuditEvent({
    userId: ctx.profile.id,
    action: "calendar_sources_updated",
    resourceType: "calendar",
    metadata: clean,
  });
}
