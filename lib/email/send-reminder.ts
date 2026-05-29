import "server-only";

import { getFromAddress, getResend, siteUrl } from "./client";
import {
  reminderEmailHtml,
  reminderEmailSubject,
  reminderEmailText,
  type ReminderEmailData,
} from "./templates/reminder";
import { recordSystemEvent } from "@/lib/data/system-events";

export type SendReminderResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "not_configured" }
  | { status: "failed"; reason: string };

export async function sendReminderEmail(input: {
  toEmail: string;
  toName: string | null;
  title: string;
  dueAt: string | null;
  uploadTitle: string | null;
  organizationId?: string | null;
  reminderId?: string | null;
}): Promise<SendReminderResult> {
  const resend = getResend();
  const from = getFromAddress();

  if (!resend || !from) {
    return { status: "skipped", reason: "not_configured" };
  }

  const base = siteUrl().replace(/\/$/, "");
  const data: ReminderEmailData = {
    recipientName: input.toName,
    recipientEmail: input.toEmail,
    title: input.title,
    dueAt: input.dueAt,
    uploadTitle: input.uploadTitle,
    calendarUrl: `${base}/dashboard/calendar`,
  };

  try {
    const { error } = await resend.emails.send({
      from,
      to: input.toEmail,
      subject: reminderEmailSubject(data),
      html: reminderEmailHtml(data),
      text: reminderEmailText(data),
    });
    if (error) {
      const err = error as {
        message?: string;
        statusCode?: number;
        name?: string;
      };
      void recordSystemEvent({
        kind: "email.error",
        severity: "error",
        message: err.message ?? "Resend returned an error",
        context: {
          surface: "reminder",
          to: input.toEmail,
          statusCode: err.statusCode,
          name: err.name,
        },
        organizationId: input.organizationId,
      });
      return { status: "failed", reason: err.message ?? "Send failed" };
    }
    void recordSystemEvent({
      kind: "email.sent",
      severity: "info",
      message: "reminder",
      context: { surface: "reminder", to: input.toEmail },
      organizationId: input.organizationId,
    });
    return { status: "sent" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    void recordSystemEvent({
      kind: "email.error",
      severity: "error",
      message,
      context: { surface: "reminder", to: input.toEmail, thrown: true },
      organizationId: input.organizationId,
    });
    return { status: "failed", reason: message };
  }
}
