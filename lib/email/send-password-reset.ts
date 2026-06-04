import "server-only";

import { getFromAddress, getResend } from "./client";
import {
  passwordResetHtml,
  passwordResetSubject,
  passwordResetText,
} from "./templates/password-reset";
import { recordSystemEvent } from "@/lib/data/system-events";
import { maskEmail } from "@/lib/log/redact";

export type SendPasswordResetResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "not_configured" }
  | { status: "failed"; reason: string };

/**
 * Send the branded password-reset email via Resend (heyoria.com), so we do NOT
 * depend on Supabase's default SMTP. The recovery link is minted by
 * admin.generateLink upstream; this just delivers it.
 */
export async function sendPasswordResetEmail(input: {
  toEmail: string;
  toName: string | null;
  resetUrl: string;
}): Promise<SendPasswordResetResult> {
  const resend = getResend();
  const from = getFromAddress();
  if (!resend || !from) return { status: "skipped", reason: "not_configured" };

  const data = { recipientName: input.toName, resetUrl: input.resetUrl };

  try {
    const { error } = await resend.emails.send({
      from,
      to: input.toEmail,
      subject: passwordResetSubject(),
      html: passwordResetHtml(data),
      text: passwordResetText(data),
    });
    if (error) {
      const e = error as { message?: string; statusCode?: number; name?: string };
      console.error("[send-password-reset] resend failed", {
        name: e.name,
        statusCode: e.statusCode,
        message: e.message,
        to: maskEmail(input.toEmail),
      });
      void recordSystemEvent({
        kind: "email.error",
        severity: "error",
        message: e.message ?? "Resend returned an error",
        context: { surface: "password_reset", to: input.toEmail, statusCode: e.statusCode },
      });
      return { status: "failed", reason: e.message ?? "Send failed." };
    }
    void recordSystemEvent({
      kind: "email.sent",
      severity: "info",
      message: "password_reset",
      context: { surface: "password_reset", to: input.toEmail },
    });
    return { status: "sent" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    console.error("[send-password-reset] resend threw", { message, to: maskEmail(input.toEmail) });
    return { status: "failed", reason: message };
  }
}
