import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendReminderEmail } from "@/lib/email/send-reminder";
import { recordSystemEvent } from "./system-events";

/**
 * Find reminders whose notification time has arrived and send email.
 *
 * Notification time = due_at − lead_days.
 * The cron fires hourly. The window is:
 *   [now − 24 hours, now + 1 hour)
 * The −24 h floor catches reminders whose window fell during a cron outage.
 * The +1 h ceiling gives the hourly cron a small buffer.
 *
 * Called by:
 *   - GET /api/cron/send-reminders (Vercel cron, hourly)
 *   - triggerReminderNotifications() server action (admin dev button)
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
  lead_days: number;
  upload_id: string | null;
  created_by: string | null;
  assigned_to: string | null;
  organization_id: string;
};

export async function sendDueReminderNotifications(): Promise<NotificationBatchResult> {
  const admin = createAdminClient();
  const now = new Date();

  // Pull a broad window of unnotified, undone reminders due within the next
  // year. We'll filter to the exact notification window in TypeScript so
  // lead_days arithmetic is easy and testable.
  const yearOut = new Date(now.getTime() + 365 * 24 * 3600 * 1000);

  const { data: rows, error } = await admin
    .from("reminders")
    .select(
      "id, title, due_at, lead_days, upload_id, created_by, assigned_to, organization_id",
    )
    .eq("done", false)
    .is("notified_at", null)
    .not("due_at", "is", null)
    .lt("due_at", yearOut.toISOString());

  if (error || !rows?.length) {
    return { notified: 0, failed: 0, skipped: 0 };
  }

  // Filter to reminders whose notify_at falls within the cron window.
  // notify_at = due_at − lead_days * 1 day
  const windowStart = new Date(now.getTime() - 24 * 3600 * 1000); // −24 h
  const windowEnd = new Date(now.getTime() + 1 * 3600 * 1000); // +1 h

  const dueNow = (rows as ReminderRow[]).filter((r) => {
    if (!r.due_at) return false;
    const dueMs = new Date(r.due_at).getTime();
    const leadMs = (r.lead_days ?? 0) * 24 * 3600 * 1000;
    const notifyMs = dueMs - leadMs;
    return notifyMs >= windowStart.getTime() && notifyMs < windowEnd.getTime();
  });

  if (!dueNow.length) {
    return { notified: 0, failed: 0, skipped: 0 };
  }

  let notified = 0;
  let failed = 0;
  let skipped = 0;
  const nowISO = new Date().toISOString();

  for (const reminder of dueNow) {
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

    // Build a lead-time note for the email when lead_days > 0.
    const leadNote =
      (reminder.lead_days ?? 0) > 0
        ? `This was set to notify you ${reminder.lead_days} day${reminder.lead_days === 1 ? "" : "s"} in advance.`
        : null;

    const result = await sendReminderEmail({
      toEmail: profile.email as string,
      toName: (profile.full_name as string | null) ?? null,
      title: reminder.title,
      dueAt: reminder.due_at,
      uploadTitle,
      organizationId: reminder.organization_id,
      reminderId: reminder.id,
      leadNote,
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
          lead_days: reminder.lead_days,
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
