import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getLocalParts } from "@/lib/utils/tz";
import { gatherDaySignals } from "./signals";
import { computeSuggestions, type Suggestion } from "./suggestions";
import { assessOvercommitment, type OvercommitAssessment } from "./overcommit";
import type { RoutineKind } from "./generate";

/**
 * Assemble everything the Today surface renders for the daily loop, scoped to
 * one user + their active space. Reads with the service-role client but always
 * filters by the known user_id / organization_id, so it only ever returns the
 * caller's own rows. Read-only: it never writes during render.
 */

export type RoutineCard = {
  id: string;
  kind: RoutineKind;
  summary: string;
  ranAt: string;
};

export type RolloverCard = {
  id: string;
  title: string;
  href: string;
};

export type DailyLoopData = {
  routineCards: RoutineCard[];
  journalBody: string | null;
  rollovers: RolloverCard[];
  suggestions: Suggestion[];
  overcommit: OvercommitAssessment | null;
};

export async function loadDailyLoop(
  userId: string,
  organizationId: string,
  timezone: string | null,
  now: Date,
): Promise<DailyLoopData> {
  const admin = createAdminClient();
  const { ymd } = getLocalParts(now, timezone);

  const signalsP = gatherDaySignals(userId, organizationId, timezone, now);
  const routinesP = admin
    .from("routines")
    .select("id, kind, last_summary, last_run_at")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("enabled", true)
    .is("deleted_at", null)
    .not("last_summary", "is", null)
    .order("last_run_at", { ascending: false });
  const journalP = admin
    .from("daily_journals")
    .select("body")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("journal_date", ymd)
    .maybeSingle();
  const rolloverP = admin
    .from("today_pinned_cards")
    .select("id, title, href")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("card_kind", "rollover")
    .eq("for_date", ymd)
    .is("dismissed_at", null)
    .order("created_at", { ascending: true });
  const trackablesP = admin
    .from("trackables")
    .select("title")
    .eq("organization_id", organizationId)
    .is("archived_at", null);
  const dismissedP = admin
    .from("dismissed_suggestions")
    .select("suggestion_key")
    .eq("user_id", userId);

  const [signals, routinesRes, journalRes, rolloverRes, trackablesRes, dismissedRes] =
    await Promise.all([signalsP, routinesP, journalP, rolloverP, trackablesP, dismissedP]);

  // Only surface routine cards generated for today's local day.
  const routineCards: RoutineCard[] = (routinesRes.data ?? [])
    .filter((r) => {
      const ran = r.last_run_at as string | null;
      if (!ran) return false;
      return getLocalParts(new Date(ran), timezone).ymd === ymd;
    })
    .map((r) => ({
      id: r.id as string,
      kind: r.kind as RoutineKind,
      summary: r.last_summary as string,
      ranAt: r.last_run_at as string,
    }));

  const dismissed = new Set<string>(
    (dismissedRes.data ?? []).map((d) => d.suggestion_key as string),
  );
  const trackableTitles = (trackablesRes.data ?? []).map((t) => (t.title as string) ?? "");
  const suggestions = computeSuggestions(signals, trackableTitles, dismissed);

  const overcommitRaw = assessOvercommitment(signals.todayEvents);
  const overcommit = overcommitRaw.overcommitted ? overcommitRaw : null;

  return {
    routineCards,
    journalBody: (journalRes.data?.body as string) ?? null,
    rollovers: (rolloverRes.data ?? []).map((r) => ({
      id: r.id as string,
      title: (r.title as string) ?? "Reminder",
      href: (r.href as string) ?? "/dashboard",
    })),
    suggestions,
    overcommit,
  };
}
