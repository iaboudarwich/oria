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
  | { status: "failed"; reason: string };

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
      return { status: "failed", reason: error.message ?? "Send failed" };
    }
    return { status: "sent" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    return { status: "failed", reason: message };
  }
}
