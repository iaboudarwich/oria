"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/data/audit-log";
import { isReauthenticated } from "@/lib/auth/reauth";

/**
 * Session lifecycle actions for the Settings → Security tab.
 *
 * supabase.auth.signOut() accepts three scopes:
 *   - 'local'  (default): just this device. Same as the topbar Sign-out.
 *   - 'others': keep the current session alive, revoke every other one.
 *   - 'global': revoke every session including this one.
 *
 * That's the most granular control the auth-js SDK exposes today.
 * A per-session list with individual revoke would need Supabase's
 * Management API (separate auth tier with a Personal Access Token),
 * which is intentionally out of scope for an app-side action.
 */

/** Revoke every session including this one. The browser bounces to
 *  /login. Used by "Sign out everywhere" when a user suspects a
 *  device compromise. Requires a 5-minute re-auth window so a stolen
 *  session can't lock out the legitimate user. */
export async function signOutEverywhere(): Promise<void> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  if (!(await isReauthenticated(userData.user.id))) {
    redirect(
      "/dashboard/settings?tab=security&error=" +
        encodeURIComponent("Sign in again before revoking sessions."),
    );
  }
  await logAuditEvent({
    userId: userData.user.id,
    action: "auth.signout.global",
  });
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?notice=Signed+out+on+all+devices.");
}

/** Revoke every OTHER session (keep this one). The user stays signed
 *  in here. Useful when the user wants to evict an old phone or a
 *  shared computer without re-authenticating themselves. */
export async function signOutOthers(): Promise<void> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  if (!(await isReauthenticated(userData.user.id))) {
    redirect(
      "/dashboard/settings?tab=security&error=" +
        encodeURIComponent("Sign in again before revoking other sessions."),
    );
  }
  await logAuditEvent({
    userId: userData.user.id,
    action: "auth.session.revoke",
    metadata: { scope: "others" },
  });
  await supabase.auth.signOut({ scope: "others" });
  redirect("/dashboard/settings?tab=security&notice=other-sessions-revoked");
}
