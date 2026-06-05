import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { getLocalParts } from "@/lib/utils/tz";
import { logAuditEvent } from "@/lib/data/audit-log";
import { computeStreak, isScheduledOnDay, addDays, type Cadence } from "@/lib/rituals/streak";

/**
 * The ritual slice of the daily-loop cron. Two jobs, both per-user-local and
 * idempotent (guarded by a per-day date column so a retry in the same hour
 * re-does nothing):
 *
 *  1. Reminder hook: at a ritual's reminder_time hour, on a scheduled day it is
 *     not yet done, create ONE reminder row (reusing the reminders table; the
 *     existing send-reminders cron delivers it). No new reminder system.
 *  2. Freeze audit: at the local dawn, if yesterday was a scheduled day that a
 *     freeze saved, log ritual.freeze_consumed. (Streaks themselves are computed
 *     on read; this only records the audit trail the round asks for.)
 */

const DAWN_LOCAL_HOUR = 5;

export type RitualRow = {
  id: string;
  user_id: string;
  organization_id: string;
  title: string;
  cadence: Cadence;
  days: number[];
  reminder_time: string | null;
  last_reminder_date: string | null;
  last_eval_date: string | null;
  created_at: string;
};

export type RitualCompletionRow = { ritual_id: string; completed_date: string };

function reminderHour(time: string | null): number | null {
  if (!time) return null;
  const m = /^(\d{2}):/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
}

export async function runRitualsForUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  orgId: string,
  parts: { hour: number; dayOfWeek: number; ymd: string },
  tz: string | null,
  now: Date,
  rituals: RitualRow[],
  completionsByRitual: Map<string, Set<string>>,
): Promise<number> {
  const { hour, ymd } = parts;
  let remindersCreated = 0;

  for (const r of rituals) {
    if (r.organization_id !== orgId) continue;
    const completed = completionsByRitual.get(r.id) ?? new Set<string>();

    // 1. Reminder hook.
    const rh = reminderHour(r.reminder_time);
    if (
      rh !== null &&
      rh === hour &&
      r.last_reminder_date !== ymd &&
      isScheduledOnDay(r.cadence, r.days, ymd) &&
      !completed.has(ymd)
    ) {
      await admin.from("reminders").insert({
        organization_id: orgId,
        created_by: userId,
        title: r.title,
        due_at: now.toISOString(),
        source: "system",
      });
      await admin.from("rituals").update({ last_reminder_date: ymd }).eq("id", r.id);
      remindersCreated += 1;
    }

    // 2. Freeze audit at the local dawn (once per local day).
    if (hour === DAWN_LOCAL_HOUR && r.last_eval_date !== ymd) {
      const startYmd = getLocalParts(new Date(r.created_at), tz).ymd;
      const yesterday = addDays(ymd, -1);
      const res = computeStreak({
        cadence: r.cadence,
        days: r.days,
        startYmd,
        todayYmd: ymd,
        completed,
      });
      if (res.frozenMissDates.includes(yesterday)) {
        await logAuditEvent({
          userId,
          organizationId: orgId,
          action: "ritual.freeze_consumed",
          resourceType: "ritual",
          resourceId: r.id,
          metadata: { date: yesterday },
        });
      }
      await admin.from("rituals").update({ last_eval_date: ymd }).eq("id", r.id);
    }
  }

  return remindersCreated;
}
