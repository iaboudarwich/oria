import "server-only";

import { getFromAddress, getResend, siteUrl } from "./client";
import {
  inviteEmailHtml,
  inviteEmailSubject,
  inviteEmailText,
  type InviteEmailData,
} from "./templates/invite";
import type { AccessLevel } from "@/lib/supabase/types";

export type SendInviteResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "not_configured" }
  | { status: "failed"; reason: string; statusCode?: number };

export async function sendInviteEmail(input: {
  toEmail: string;
  toName: string | null;
  inviterName: string;
  circleName: string;
  circleDescription: string | null;
  title: string | null;
  accessLevel: AccessLevel;
  token: string;
  code: string;
}): Promise<SendInviteResult> {
  const resend = getResend();
  const from = getFromAddress();

  if (!resend || !from) {
    return { status: "skipped", reason: "not_configured" };
  }

  const base = siteUrl().replace(/\/$/, "");
  const data: InviteEmailData = {
    circleName: input.circleName,
    circleDescription: input.circleDescription,
    inviterName: input.inviterName,
    recipientName: input.toName,
    recipientEmail: input.toEmail,
    title: input.title,
    accessLevel: input.accessLevel,
    inviteUrl: `${base}/invite/${input.token}`,
    inviteCode: input.code,
    codeUrl: `${base}/invite/code`,
  };

  try {
    const { error } = await resend.emails.send({
      from,
      to: input.toEmail,
      subject: inviteEmailSubject(data),
      html: inviteEmailHtml(data),
      text: inviteEmailText(data),
      replyTo: input.inviterName.includes("@") ? input.inviterName : undefined,
    });
    if (error) {
      // Resend's SDK error shape: { name, message, statusCode?, ... }.
      // Log the full thing so Vercel runtime logs capture the actual cause
      // (most common: 403 "from address not verified", 422 "validation
      // error", 429 rate limit). Without this the UI just sees the
      // generic message and the operator can't diagnose.
      const errWithStatus = error as {
        message?: string;
        statusCode?: number;
        name?: string;
      };
      console.error("[send-invite] resend.emails.send failed", {
        name: errWithStatus.name,
        statusCode: errWithStatus.statusCode,
        message: errWithStatus.message,
        from,
        to: input.toEmail,
      });
      return {
        status: "failed",
        reason: friendlyReason(errWithStatus),
        statusCode: errWithStatus.statusCode,
      };
    }
    return { status: "sent" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    console.error("[send-invite] resend SDK threw", { message, from, to: input.toEmail });
    return { status: "failed", reason: message };
  }
}

/**
 * Translate raw Resend errors into something operators can act on.
 * Falls back to the model's message when no specific case matches.
 */
function friendlyReason(err: {
  message?: string;
  statusCode?: number;
  name?: string;
}): string {
  const msg = (err.message ?? "").toLowerCase();
  if (err.statusCode === 403 || msg.includes("not verified") || msg.includes("domain")) {
    return "Sending domain isn't verified on Resend yet.";
  }
  if (err.statusCode === 422 || msg.includes("invalid")) {
    return "Resend rejected the request (check RESEND_FROM_EMAIL format).";
  }
  if (err.statusCode === 429 || msg.includes("rate")) {
    return "Resend rate limit hit. Try again in a minute.";
  }
  if (err.statusCode === 401 || msg.includes("api key") || msg.includes("unauthorized")) {
    return "Resend API key was rejected.";
  }
  return err.message ?? "Send failed.";
}
