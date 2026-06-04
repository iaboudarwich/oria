import "server-only";

export type PasswordResetEmailData = {
  /** The recipient's display name, if known. */
  recipientName: string | null;
  /** The full action link (Supabase verify URL) that establishes the
   *  recovery session and lands on /auth/reset. */
  resetUrl: string;
};

export function passwordResetSubject(): string {
  return "Reset your Oria password";
}

/** Plain-text fallback for clients that block HTML or for accessibility. */
export function passwordResetText(d: PasswordResetEmailData): string {
  const greeting = d.recipientName ? `Hi ${d.recipientName},` : "Hi,";
  return [
    greeting,
    "",
    "We got a request to reset the password on your Oria account.",
    "Open this link to choose a new password. It expires in one hour and can be used once:",
    "",
    d.resetUrl,
    "",
    "If you did not ask for this, you can ignore this email. Your password stays the same.",
    "",
    "Oria",
  ].join("\n");
}

/** Branded HTML, matching the calm Oria voice. Inline styles only (email-safe). */
export function passwordResetHtml(d: PasswordResetEmailData): string {
  const greeting = d.recipientName ? `Hi ${escapeHtml(d.recipientName)},` : "Hi,";
  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;background:#f5f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1a17;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#fbfaf6;border:1px solid #e2d9c5;border-radius:16px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 18px;font-family:Georgia,'Times New Roman',Times,serif;font-size:24px;font-weight:500;letter-spacing:-0.01em;color:#0f0f0f;">Oria</p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">${greeting}</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">We got a request to reset the password on your Oria account. Choose a new one below. This link expires in one hour and can be used once.</p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#0f0f0f;">
            <a href="${escapeAttr(d.resetUrl)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#fbfaf6;text-decoration:none;border-radius:10px;">Set a new password</a>
          </td></tr></table>
          <p style="margin:22px 0 0;font-size:12.5px;line-height:1.5;color:#6b6357;">If you did not ask for this, you can ignore this email. Your password stays the same.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}
