import "server-only";

export type ReminderEmailData = {
  recipientName: string | null;
  recipientEmail: string;
  title: string;
  /** ISO timestamp of when the reminder is due. */
  dueAt: string | null;
  /** Title of the linked upload, if any. */
  uploadTitle: string | null;
  /** Link to the calendar page so the user can open and mark it done. */
  calendarUrl: string;
  /** e.g. "This was set to notify you 60 days in advance." */
  leadNote?: string | null;
};

export function reminderEmailSubject(d: ReminderEmailData): string {
  return `Reminder: ${d.title}`;
}

/**
 * Plain-text fallback for clients that block HTML.
 */
export function reminderEmailText(d: ReminderEmailData): string {
  const greeting = d.recipientName ? `Hi ${d.recipientName},` : "Hi,";
  const lines = [
    greeting,
    "",
    "You have a reminder:",
    "",
    `  ${d.title}`,
    d.dueAt ? `  Due: ${formatDueDateUtc(d.dueAt)}` : "",
    d.uploadTitle ? `  Related to: ${d.uploadTitle}` : "",
    d.leadNote ? `  Note: ${d.leadNote}` : "",
    "",
    "Open your calendar:",
    d.calendarUrl,
    "",
    "Oria",
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Minimal HTML email. Inline styles only, wide email-client compatibility.
 * Tone and structure match the invite email. clean, no marketing.
 */
export function reminderEmailHtml(d: ReminderEmailData): string {
  const greeting = d.recipientName
    ? `Hi ${escapeHtml(d.recipientName)},`
    : "Hi,";
  const dueRow = d.dueAt
    ? `<p style="margin:6px 0 0 0;font-size:13px;color:#6b6258;">${escapeHtml(formatDueDateUtc(d.dueAt))}</p>`
    : "";
  const uploadRow = d.uploadTitle
    ? `<p style="margin:10px 0 0 0;font-size:12px;color:#9c9387;">Related to: ${escapeHtml(d.uploadTitle)}</p>`
    : "";
  const leadRow = d.leadNote
    ? `<p style="margin:10px 0 0 0;font-size:12px;color:#9c9387;">${escapeHtml(d.leadNote)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(reminderEmailSubject(d))}</title>
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
                <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#9c9387;">
                  Reminder
                </p>
                <h1 style="margin:0;font-size:20px;line-height:1.3;letter-spacing:-0.01em;font-weight:600;color:#1c1a17;">
                  ${escapeHtml(d.title)}
                </h1>
                ${dueRow}
                ${uploadRow}
                ${leadRow}

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 0 0;">
                  <tr>
                    <td align="center">
                      <a href="${escapeAttr(d.calendarUrl)}"
                         style="display:inline-block;background:#1c1a17;color:#fbfaf6;text-decoration:none;font-size:14px;font-weight:500;padding:12px 22px;border-radius:12px;">
                        Open calendar
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 4px 0 4px;font-size:12px;line-height:1.5;color:#9c9387;text-align:center;">
                You're receiving this because you set a reminder in Oria.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Format an ISO timestamp as "Monday, January 6" (UTC, v1. no tz). */
function formatDueDateUtc(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
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
