"use server";

import { isCurrentUserAdmin } from "./admin";
import { sendDueReminderNotifications } from "./reminder-notifications";
import { redirect } from "next/navigation";

/**
 * Admin-only server action that manually triggers the reminder notification
 * batch. same logic as the Vercel cron, useful for local dev or on-demand
 * operator use from the admin health page.
 */
export async function triggerReminderNotifications(): Promise<void> {
  const admin = await isCurrentUserAdmin();
  if (!admin) {
    redirect("/dashboard");
  }
  const result = await sendDueReminderNotifications();
  redirect(
    `/dashboard/admin/health?reminders_sent=${result.notified}&reminders_failed=${result.failed}`,
  );
}
