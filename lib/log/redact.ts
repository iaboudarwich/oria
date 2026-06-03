/**
 * Redaction helpers for operational logs.
 *
 * console.* on the server lands in shared Vercel runtime logs, and breadcrumbs
 * can reach Sentry. User content (email addresses, document filenames, message
 * bodies) must never appear there in raw form. Use these helpers wherever an
 * operational log would otherwise interpolate user data. See
 * docs/audits/round-15-pii-scrub.md.
 */

/**
 * Mask an email's local part: "jane.doe@example.com" -> "j***@example.com".
 * Keeps the domain (useful for diagnosing sender/recipient issues, e.g. a
 * "from address not verified" error) without exposing the individual.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email || typeof email !== "string") return "[redacted]";
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return "[redacted-email]";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local[0]}***@${domain}`;
}

/**
 * Redact a user filename to its extension only: "tax_return_2023.pdf"
 * -> "[file].pdf". Filenames can reveal sensitive content (medical, legal,
 * financial), so only the file type is kept for diagnostics.
 */
export function redactFilename(filename: string | null | undefined): string {
  if (!filename || typeof filename !== "string") return "[file]";
  const dot = filename.lastIndexOf(".");
  const ext = dot > 0 && dot < filename.length - 1 ? filename.slice(dot) : "";
  return `[file]${ext.toLowerCase()}`;
}
