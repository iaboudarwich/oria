import "server-only";

import { ACCESS_LEVEL_LABELS } from "@/lib/data/access-labels";
import type { AccessLevel } from "@/lib/supabase/types";

export type InviteEmailData = {
  circleName: string;
  circleDescription: string | null;
  inviterName: string;
  recipientName: string | null;
  recipientEmail: string;
  title: string | null;
  accessLevel: AccessLevel;
  inviteUrl: string;
  inviteCode: string;
  codeUrl: string;
};

export function inviteEmailSubject(d: InviteEmailData): string {
  return `${d.inviterName} invited you to ${d.circleName} on Oria`;
}

/**
 * Plain-text fallback for clients that block HTML or for accessibility.
 */
export function inviteEmailText(d: InviteEmailData): string {
  const greeting = d.recipientName ? `Hi ${d.recipientName},` : "Hi,";
  const titleNote = d.title ? ` (as ${d.title})` : "";

  return [
    greeting,
    "",
    `${d.inviterName} invited you to join "${d.circleName}" on Oria${titleNote}.`,
    d.circleDescription ? `\n${d.circleDescription}\n` : "",
    `Access level: ${ACCESS_LEVEL_LABELS[d.accessLevel]}`,
    "",
    "Open this link to accept:",
    d.inviteUrl,
    "",
    `Or enter this code at ${d.codeUrl}:`,
    `    ${d.inviteCode}`,
    "",
    "The link is one-time use and expires in 14 days.",
    "If you weren't expecting this, you can ignore the email.",
    "",
    "Oria",
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
}

/**
 * Minimal, trustworthy HTML email. Inline styles only (no CSS classes), wide
 * email-client compatibility, no images, light card on a calm background.
 */
export function inviteEmailHtml(d: InviteEmailData): string {
  const greeting = d.recipientName
    ? `Hi ${escapeHtml(d.recipientName)},`
    : "Hi,";
  const titleChip = d.title
    ? `<span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:6px;background:#f1ede4;color:#6b6258;font-size:12px;">${escapeHtml(d.title)}</span>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(inviteEmailSubject(d))}</title>
  </head>
  <body style="margin:0;padding:0;background:#f7f5f0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Arial,sans-serif;color:#1c1a17;-webkit-font-smoothing:antialiased;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7f5f0;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;">
            <tr>
              <td style="padding:0 4px 20px 4px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#9c9387;">
                Oria
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid rgba(28,26,23,0.08);border-radius:16px;padding:28px 28px 24px 28px;">
                <p style="margin:0 0 18px 0;font-size:14px;line-height:1.5;color:#6b6258;">
                  ${greeting}
                </p>
                <h1 style="margin:0 0 14px 0;font-size:22px;line-height:1.25;letter-spacing:-0.01em;font-weight:600;color:#1c1a17;">
                  ${escapeHtml(d.inviterName)} invited you to join <span style="white-space:nowrap;">${escapeHtml(d.circleName)}</span>
                </h1>
                ${
                  d.circleDescription
                    ? `<p style="margin:0 0 18px 0;font-size:14px;line-height:1.55;color:#3a352d;">${escapeHtml(d.circleDescription)}</p>`
                    : ""
                }

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 22px 0;background:#fbfaf6;border:1px solid rgba(28,26,23,0.08);border-radius:10px;">
                  <tr>
                    <td style="padding:12px 14px;font-size:13px;color:#3a352d;">
                      <div style="display:flex;align-items:center;">
                        <span style="color:#6b6258;display:inline-block;width:96px;font-size:12px;">Invited as</span>
                        <span style="color:#1c1a17;">${escapeHtml(d.recipientName ?? d.recipientEmail)}</span>${titleChip}
                      </div>
                      <div style="height:1px;background:rgba(28,26,23,0.08);margin:10px 0;"></div>
                      <div style="display:flex;align-items:center;">
                        <span style="color:#6b6258;display:inline-block;width:96px;font-size:12px;">Can see</span>
                        <span style="color:#1c1a17;">${escapeHtml(ACCESS_LEVEL_LABELS[d.accessLevel])}</span>
                      </div>
                    </td>
                  </tr>
                </table>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td align="center">
                      <a href="${escapeAttr(d.inviteUrl)}"
                         style="display:inline-block;background:#1c1a17;color:#fbfaf6;text-decoration:none;font-size:14px;font-weight:500;padding:12px 22px;border-radius:12px;">
                        Accept invite
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:22px 0 6px 0;font-size:12px;color:#9c9387;text-align:center;">
                  Or use this code at <a href="${escapeAttr(d.codeUrl)}" style="color:#6b6258;text-decoration:underline;">${escapeHtml(stripScheme(d.codeUrl))}</a>
                </p>
                <p style="margin:0 0 4px 0;font-size:18px;font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;letter-spacing:0.15em;color:#1c1a17;text-align:center;">
                  ${escapeHtml(d.inviteCode)}
                </p>

                <p style="margin:22px 0 0 0;font-size:12px;line-height:1.5;color:#9c9387;text-align:center;">
                  One-time use. Expires in 14 days.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 4px 0 4px;font-size:12px;line-height:1.5;color:#9c9387;text-align:center;">
                If you weren't expecting this email you can ignore it.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
