import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getLocalParts } from "@/lib/utils/tz";
import { logAuditEvent } from "@/lib/data/audit-log";
import { sendPushToUser } from "@/lib/push/web-push";
import { gatherDaySignals, type DaySignals } from "./signals";
import { generateRoutineText, generateJournalText, type RoutineKind } from "./generate";
import { applyRollForward } from "./rollforward";
import { dailyPushBody } from "./push-copy";
import { runRitualsForUser, type RitualRow, type RitualCompletionRow } from "./ritual-runner";

/**
 * The daily-loop orchestrator. The hourly cron calls runDailyLoop(now); for
 * every user it resolves the local wall-clock from profiles.timezone and fires
 * whatever is due THIS local hour: time-based routines, pre-meeting prep,
 * roll-forward, and the 21:00 journal. Everything is idempotent (a second pass
 * in the same hour re-runs nothing), so the cron is safe to retry.
 *
 * Scope is the user's primary space (oldest membership). Launch is five users;
 * this loops users in memory, which is the right shape at this size.
 */

const JOURNAL_LOCAL_HOUR = 21;
const ROLLFORWARD_LOCAL_HOUR = 5;

type DefaultRoutine = {
  kind: RoutineKind;
  title: string;
  enabled: boolean;
  local_hour: number | null;
  day_of_week: number | null;
  lead_minutes: number | null;
};

// Seeded once per user (in their primary space) the first time the loop sees
// them. Titles are English seeds; the Today UI relabels by kind via i18n.
const DEFAULT_ROUTINES: DefaultRoutine[] = [
  { kind: "morning_briefing", title: "Morning Briefing", enabled: true, local_hour: 7, day_of_week: null, lead_minutes: null },
  { kind: "weekly_review", title: "Weekly Review", enabled: true, local_hour: 8, day_of_week: 1, lead_minutes: null },
  { kind: "yesterday_recap", title: "Yesterday Recap", enabled: false, local_hour: 20, day_of_week: null, lead_minutes: null },
  { kind: "pre_meeting_prep", title: "Pre-Meeting Prep", enabled: true, local_hour: null, day_of_week: null, lead_minutes: 30 },
];

export type RunSummary = {
  users: number;
  routinesRun: number;
  prepsRun: number;
  journalsRun: number;
  rolledForward: number;
  ritualReminders: number;
};

type Profile = { id: string; timezone: string | null; locale: string | null };
type RoutineRow = {
  id: string;
  user_id: string;
  organization_id: string;
  kind: RoutineKind;
  prompt: string | null;
  enabled: boolean;
  local_hour: number | null;
  day_of_week: number | null;
  lead_minutes: number | null;
  last_run_at: string | null;
  last_ref_id: string | null;
};

export async function runDailyLoop(now: Date): Promise<RunSummary> {
  const admin = createAdminClient();
  const summary: RunSummary = {
    users: 0,
    routinesRun: 0,
    prepsRun: 0,
    journalsRun: 0,
    rolledForward: 0,
    ritualReminders: 0,
  };

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, timezone, locale");
  if (!profiles?.length) return summary;

  // Primary space per user: oldest membership.
  const { data: memberships } = await admin
    .from("memberships")
    .select("user_id, organization_id, created_at")
    .order("created_at", { ascending: true });
  const primaryOrg = new Map<string, string>();
  for (const m of memberships ?? []) {
    const uid = m.user_id as string;
    if (!primaryOrg.has(uid)) primaryOrg.set(uid, m.organization_id as string);
  }

  await ensureDefaults(admin, profiles as Profile[], primaryOrg);

  const { data: routines } = await admin
    .from("routines")
    .select(
      "id, user_id, organization_id, kind, prompt, enabled, local_hour, day_of_week, lead_minutes, last_run_at, last_ref_id",
    )
    .eq("enabled", true)
    .is("deleted_at", null);
  const routinesByUser = new Map<string, RoutineRow[]>();
  for (const r of (routines ?? []) as RoutineRow[]) {
    const list = routinesByUser.get(r.user_id) ?? [];
    list.push(r);
    routinesByUser.set(r.user_id, list);
  }

  // Rituals: active definitions + their completions, grouped per user. Drives
  // the reminder hook and the freeze audit (see ritual-runner).
  const { data: ritualRows } = await admin
    .from("rituals")
    .select(
      "id, user_id, organization_id, title, cadence, days, reminder_time, last_reminder_date, last_eval_date, created_at",
    )
    .is("archived_at", null);
  const ritualsByUser = new Map<string, RitualRow[]>();
  for (const r of (ritualRows ?? []) as RitualRow[]) {
    const list = ritualsByUser.get(r.user_id) ?? [];
    list.push(r);
    ritualsByUser.set(r.user_id, list);
  }
  const completionsByRitual = new Map<string, Set<string>>();
  const ritualIds = ((ritualRows ?? []) as RitualRow[]).map((r) => r.id);
  if (ritualIds.length) {
    const { data: comps } = await admin
      .from("ritual_completions")
      .select("ritual_id, completed_date")
      .in("ritual_id", ritualIds);
    for (const c of (comps ?? []) as RitualCompletionRow[]) {
      const set = completionsByRitual.get(c.ritual_id) ?? new Set<string>();
      set.add(c.completed_date);
      completionsByRitual.set(c.ritual_id, set);
    }
  }

  for (const profile of profiles as Profile[]) {
    const orgId = primaryOrg.get(profile.id);
    if (!orgId) continue;
    summary.users += 1;
    const tz = profile.timezone;
    const { hour, dayOfWeek, ymd } = getLocalParts(now, tz);

    // Gather signals lazily, once, only if any work might fire this hour.
    let signals: DaySignals | null = null;
    const getSignals = async () => {
      if (!signals) signals = await gatherDaySignals(profile.id, orgId, tz, now);
      return signals;
    };

    // Time-based routines.
    for (const routine of routinesByUser.get(profile.id) ?? []) {
      if (routine.organization_id !== orgId) continue;
      if (routine.kind === "pre_meeting_prep") continue; // handled below
      if (!isTimeRoutineDue(routine, hour, dayOfWeek, ymd, tz)) continue;
      const s = await getSignals();
      const text = await generateRoutineText(
        profile.id,
        { kind: routine.kind, prompt: routine.prompt },
        s,
      );
      if (!text) continue;
      await admin
        .from("routines")
        .update({ last_run_at: now.toISOString(), last_summary: text, last_seen_at: null })
        .eq("id", routine.id);
      await deliver(profile, orgId, routine.id, routine.kind, "routine");
      summary.routinesRun += 1;
    }

    // Pre-meeting prep (event-driven).
    for (const routine of routinesByUser.get(profile.id) ?? []) {
      if (routine.kind !== "pre_meeting_prep" || routine.organization_id !== orgId) continue;
      const ran = await runPreMeetingPrep(admin, profile, orgId, routine, now, getSignals);
      if (ran) summary.prepsRun += 1;
    }

    // Roll-forward: materialize yesterday's unfinished items at the local dawn.
    if (hour === ROLLFORWARD_LOCAL_HOUR) {
      const s = await getSignals();
      const n = await applyRollForward(admin, profile.id, orgId, s.remindersOverdue, ymd);
      if (n > 0) {
        summary.rolledForward += n;
        await logAuditEvent({
          userId: profile.id,
          action: "today.rollover",
          organizationId: orgId,
          metadata: { count: n, for_date: ymd },
        });
      }
    }

    // Daily journal at 21:00 local.
    if (hour === JOURNAL_LOCAL_HOUR) {
      const ran = await runJournal(admin, profile, orgId, ymd, getSignals);
      if (ran) summary.journalsRun += 1;
    }

    // Rituals: reminder hook (at each ritual's hour) + freeze audit (at dawn).
    const userRituals = ritualsByUser.get(profile.id);
    if (userRituals?.length) {
      summary.ritualReminders += await runRitualsForUser(
        admin,
        profile.id,
        orgId,
        { hour, dayOfWeek, ymd },
        tz,
        now,
        userRituals,
        completionsByRitual,
      );
    }
  }

  return summary;
}

async function ensureDefaults(
  admin: ReturnType<typeof createAdminClient>,
  profiles: Profile[],
  primaryOrg: Map<string, string>,
): Promise<void> {
  const userIds = profiles.map((p) => p.id);
  if (!userIds.length) return;
  const { data: existing } = await admin
    .from("routines")
    .select("user_id")
    .in("user_id", userIds)
    .is("deleted_at", null);
  const haveRoutines = new Set<string>((existing ?? []).map((r) => r.user_id as string));
  const rows: Record<string, unknown>[] = [];
  for (const p of profiles) {
    if (haveRoutines.has(p.id)) continue;
    const orgId = primaryOrg.get(p.id);
    if (!orgId) continue;
    for (const d of DEFAULT_ROUTINES) {
      rows.push({
        user_id: p.id,
        organization_id: orgId,
        kind: d.kind,
        title: d.title,
        enabled: d.enabled,
        local_hour: d.local_hour,
        day_of_week: d.day_of_week,
        lead_minutes: d.lead_minutes,
      });
    }
  }
  if (rows.length) await admin.from("routines").insert(rows);
}

/** A time-based routine is due when its local hour (and weekday, for weekly)
 *  matches now and it has not already run on this local day. */
function isTimeRoutineDue(
  routine: RoutineRow,
  hour: number,
  dayOfWeek: number,
  todayYmd: string,
  tz: string | null,
): boolean {
  if (routine.local_hour === null || routine.local_hour !== hour) return false;
  if (routine.kind === "weekly_review" && routine.day_of_week !== dayOfWeek) return false;
  if (routine.last_run_at) {
    const lastYmd = getLocalParts(new Date(routine.last_run_at), tz).ymd;
    if (lastYmd === todayYmd) return false;
  }
  return true;
}

async function runPreMeetingPrep(
  admin: ReturnType<typeof createAdminClient>,
  profile: Profile,
  orgId: string,
  routine: RoutineRow,
  now: Date,
  getSignals: () => Promise<DaySignals>,
): Promise<boolean> {
  const lead = routine.lead_minutes ?? 30;
  const windowEnd = new Date(now.getTime() + lead * 60 * 1000);
  const { data: events } = await admin
    .from("calendar_events")
    .select("id, title, starts_at, ends_at, is_all_day")
    .eq("organization_id", orgId)
    .eq("user_id", profile.id)
    .eq("is_all_day", false)
    .gte("starts_at", now.toISOString())
    .lte("starts_at", windowEnd.toISOString())
    .order("starts_at", { ascending: true })
    .limit(1);
  const event = events?.[0];
  if (!event) return false;
  if (routine.last_ref_id === (event.id as string)) return false; // already prepped

  const s = await getSignals();
  const text = await generateRoutineText(
    profile.id,
    { kind: "pre_meeting_prep", prompt: routine.prompt },
    s,
    {
      id: event.id as string,
      title: (event.title as string) ?? "your meeting",
      startsAt: event.starts_at as string,
      endsAt: (event.ends_at as string) ?? null,
      isAllDay: false,
    },
  );
  if (!text) return false;
  await admin
    .from("routines")
    .update({
      last_run_at: now.toISOString(),
      last_summary: text,
      last_ref_id: event.id as string,
      last_seen_at: null,
    })
    .eq("id", routine.id);
  await deliver(profile, orgId, routine.id, "pre_meeting_prep", "routine");
  return true;
}

async function runJournal(
  admin: ReturnType<typeof createAdminClient>,
  profile: Profile,
  orgId: string,
  todayYmd: string,
  getSignals: () => Promise<DaySignals>,
): Promise<boolean> {
  const { data: existing } = await admin
    .from("daily_journals")
    .select("id")
    .eq("user_id", profile.id)
    .eq("organization_id", orgId)
    .eq("journal_date", todayYmd)
    .maybeSingle();
  if (existing) return false; // idempotent: one entry per local day

  const s = await getSignals();
  const body = await generateJournalText(profile.id, s);
  if (!body) return false;
  const { error } = await admin.from("daily_journals").insert({
    user_id: profile.id,
    organization_id: orgId,
    journal_date: todayYmd,
    body,
  });
  if (error) return false; // unique violation if a racing pass won; that is fine
  await logAuditEvent({
    userId: profile.id,
    action: "journal.created",
    organizationId: orgId,
    resourceType: "daily_journal",
    metadata: { journal_date: todayYmd },
  });
  await pushKind(profile, orgId, "journal");
  return true;
}

/** Audit the routine run and push a generic nudge. */
async function deliver(
  profile: Profile,
  orgId: string,
  routineId: string,
  kind: RoutineKind,
  resourceType: string,
): Promise<void> {
  await logAuditEvent({
    userId: profile.id,
    action: "routine.executed",
    organizationId: orgId,
    resourceType,
    resourceId: routineId,
    metadata: { kind },
  });
  await pushKind(profile, orgId, kind);
}

async function pushKind(
  profile: Profile,
  _orgId: string,
  kind: RoutineKind | "journal",
): Promise<void> {
  const { title, body } = dailyPushBody(kind, profile.locale);
  await sendPushToUser(profile.id, { title, body, url: "/dashboard", tag: `oria-${kind}` });
}
