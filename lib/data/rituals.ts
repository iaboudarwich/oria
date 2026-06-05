import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { getLocalParts, getOriaTzCookieName } from "@/lib/utils/tz";
import { computeStreak, type Cadence, type StreakResult } from "@/lib/rituals/streak";

/**
 * Read layer for rituals. User-scoped (RLS is SELECT-own; we also filter by
 * user_id). Streaks + freezes are COMPUTED here from completions in the user's
 * local timezone, never stored, so they cannot drift.
 */

export type Ritual = {
  id: string;
  title: string;
  cadence: Cadence;
  days: number[];
  reminder_time: string | null;
  created_at: string;
};

export type RitualView = Ritual & { streak: StreakResult };

type RitualRow = {
  id: string;
  title: string;
  cadence: Cadence;
  days: number[];
  reminder_time: string | null;
  created_at: string;
};

/** The user's active rituals with today's done state, current/best streak, and
 *  freezes remaining, computed against their local day. */
export async function listRituals(): Promise<RitualView[]> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const tz = (await cookies()).get(getOriaTzCookieName())?.value ?? null;
  const todayYmd = getLocalParts(new Date(), tz).ymd;

  const { data: ritualRows } = await supabase
    .from("rituals")
    .select("id, title, cadence, days, reminder_time, created_at")
    .eq("user_id", ctx.profile.id)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  const rituals = (ritualRows as RitualRow[]) ?? [];
  if (rituals.length === 0) return [];

  const { data: compRows } = await supabase
    .from("ritual_completions")
    .select("ritual_id, completed_date")
    .in(
      "ritual_id",
      rituals.map((r) => r.id),
    );
  const byRitual = new Map<string, Set<string>>();
  for (const c of (compRows as { ritual_id: string; completed_date: string }[]) ?? []) {
    const set = byRitual.get(c.ritual_id) ?? new Set<string>();
    set.add(c.completed_date);
    byRitual.set(c.ritual_id, set);
  }

  return rituals.map((r) => {
    const startYmd = getLocalParts(new Date(r.created_at), tz).ymd;
    const completed = byRitual.get(r.id) ?? new Set<string>();
    const streak = computeStreak({
      cadence: r.cadence,
      days: r.days,
      startYmd,
      todayYmd,
      completed,
    });
    return { ...r, streak };
  });
}

/** Count of active rituals scheduled today that are done (for the Today line). */
export async function ritualsDoneToday(): Promise<{ done: number; total: number } | null> {
  const rituals = await listRituals();
  const scheduled = rituals.filter((r) => r.streak.scheduledToday);
  if (scheduled.length === 0) return null;
  return { done: scheduled.filter((r) => r.streak.doneToday).length, total: scheduled.length };
}
