import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { sendDueReminderNotifications } from "@/lib/data/reminder-notifications";

/**
 * GET /api/cron/send-reminders
 *
 * Vercel Cron fires this every hour (see vercel.json). Finds reminders
 * due today or tomorrow (UTC) that haven't been notified yet, sends each
 * one email, and writes a reminder.notified system event.
 *
 * Auth: Authorization: Bearer CRON_SECRET (same secret as process-uploads).
 *
 * Returns: { notified, failed, skipped } counts.
 * "skipped" means email isn't configured — not an error.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendDueReminderNotifications();
  return NextResponse.json(result);
}
