import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_CALENDAR_SOURCES, type CalendarSourcePrefs } from "./calendar-types";

/**
 * The user's persisted calendar source filter (events/reminders/bills). NULL or
 * missing keys default to on, so a fresh user sees everything. Read via the
 * user-scoped client so RLS limits it to their own row.
 */
export async function getCalendarSources(userId: string): Promise<CalendarSourcePrefs> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_preferences")
    .select("calendar_sources")
    .eq("user_id", userId)
    .maybeSingle();
  const raw = (data as { calendar_sources?: Partial<CalendarSourcePrefs> | null } | null)
    ?.calendar_sources;
  return { ...DEFAULT_CALENDAR_SOURCES, ...(raw ?? {}) };
}
