import "server-only";

import { getCurrentContext } from "./organizations";

/**
 * Admin access is gated by a single env var: ADMIN_EMAILS, a
 * comma-separated list of email addresses. Operators rotate the list
 * by editing the env var in Vercel — no code change, no migration.
 *
 * Read-only: every admin surface in the app is read-only by contract.
 * If you find yourself adding a destructive admin action, stop and
 * make it a per-user action instead — the admin page is for visibility,
 * not control.
 */

function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

/** Lower-cases the email before checking — the env list is matched case-
 *  insensitively so an operator can type "Issam@example.com" in the
 *  Vercel UI without worrying about exact casing. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().has(email.toLowerCase());
}

/** Returns true when the signed-in user's email is on the admin list.
 *  Used by Settings to decide whether to render the admin link and by
 *  the admin page itself as a defence-in-depth gate. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const ctx = await getCurrentContext();
  if (!ctx) return false;
  return isAdminEmail(ctx.profile.email);
}
