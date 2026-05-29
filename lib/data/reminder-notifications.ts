import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendReminderEmail } from "@/lib/email/send-reminder";
import { recordSystemEvent } from "./system-events";

/**
 * Find reminders due today or tomorrow (UTC) that haven't been notified yet,
 * and send one email + in-app system event per reminder.
 *
 * Called by:
 *   - GET /api/cron/send-reminders (Vercel cron, hourly)
 *   - triggerReminderNotifications() server action (admin dev button)
 *
 * Design decisions:
 *   - Window: due_at within [start_of_today_UTC, start_of_day_after_tomorrow_UTC)
 *     so the cron covers both "same day" and "day before" in one pass.
 *   - notified_at IS NULL guards against double-sends when the cron fires
 *     multiple times in the same day.
 *   - Per-reminder errors set notification_failed_at and continue — one
 *     bad address never blocks the rest of the batch.
 *   - "not_configured" (no Resend key) is a silent skip, not a failure,
 *     so dev environments without RESEND_API_KEY don't pollute the log.
 */
export type NotificationBatchResult = {
  notified: number;
  failed: number;
  skipped: number;
};

type ReminderRow = {
  id: string;
  title: string;
  due_at: string | null;
  upload_id: string | null;
  created_by: string | null;
  assigned_to: string | null;
  organization_id: string;
};

export async function sendDueReminderNotifications(): Promise<NotificationBatchResult> {
  const admin = createAdminClient();
  const now = new Date();

  // UTC day boundaries
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayAfterTomorrow = new Date(todayStart.getTime() + 48 * 60 * 60 * 1000);

  const { data: rows, error } = await admin
    .from("reminders")
    .select(
      "id, title, due_at, upload_id, created_by, assigned_to, organization_id",
    )
    .eq("done", false)
    .is("notified_at", null)
    .gte("due_at", todayStart.toISOString())
    .lt("due_at", dayAfterTomorrow.toISOString());

  if (error || !rows?.length) {
    return { notified: 0, failed: 0, skipped: 0 };
  }

  let notified = 0;
  let failed = 0;
  let skipped = 0;
  const nowISO = new Date().toISOString();

  for (const reminder of rows as ReminderRow[]) {
    const recipientId = reminder.assigned_to ?? reminder.created_by;
    if (!recipientId) {
      await admin
        .from("reminders")
        .update({ notification_failed_at: nowISO })
        .eq("id", reminder.id);
      failed++;
      continue;
    }

    // Fetch recipient's email and name from profiles.
    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", recipientId)
      .maybeSingle();

    if (!profile?.email) {
      await admin
        .from("reminders")
        .update({ notification_failed_at: nowISO })
        .eq("id", reminder.id);
      failed++;
      continue;
    }

    // Fetch linked upload title if present.
    let uploadTitle: string | null = null;
    if (reminder.upload_id) {
      const { data: upload } = await admin
        .from("uploads")
        .select("title, filename")
        .eq("id", reminder.upload_id)
        .maybeSingle();
      uploadTitle =
        (upload as { title?: string | null; filename?: string | null } | null)
          ?.title ??
        (upload as { title?: string | null; filename?: string | null } | null)
          ?.filename ??
        null;
    }

    const result = await sendReminderEmail({
      toEmail: profile.email as string,
      toName: (profile.full_name as string | null) ?? null,
      title: reminder.title,
      dueAt: reminder.due_at,
      uploadTitle,
      organizationId: reminder.organization_id,
      reminderId: reminder.id,
    });

    if (result.status === "sent") {
      await admin
        .from("reminders")
        .update({ notified_at: nowISO })
        .eq("id", reminder.id);
      void recordSystemEvent({
        kind: "reminder.notified",
        severity: "info",
        message: `Reminder: ${reminder.title}`,
        context: {
          reminder_id: reminder.id,
          user_id: recipientId,
          channel: "email",
        },
        organizationId: reminder.organization_id,
        actorId: recipientId,
      });
      notified++;
    } else if (result.status === "failed") {
      await admin
        .from("reminders")
        .update({ notification_failed_at: nowISO })
        .eq("id", reminder.id);
      void recordSystemEvent({
        kind: "reminder.notified",
        severity: "warn",
        message: `Failed to send reminder notification: ${result.reason}`,
        context: {
          reminder_id: reminder.id,
          user_id: recipientId,
          channel: "email",
          error: result.reason,
        },
        organizationId: reminder.organization_id,
      });
      failed++;
    } else {
      // status === "skipped" — email not configured; don't mark as failed
      // so the cron will retry once email IS configured.
      skipped++;
    }
  }

  return { notified, failed, skipped };
}
