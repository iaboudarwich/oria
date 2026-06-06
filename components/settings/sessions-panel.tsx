import { signOutEverywhere, signOutOthers } from "@/lib/auth/sessions-actions";
import { Button } from "@/components/ui/button";

/**
 * Sessions panel for Settings → Security.
 *
 * Two server-action buttons:
 *   - Sign out other devices  (scope: 'others')  — stay signed in here.
 *   - Sign out everywhere     (scope: 'global')  — bounces to /login.
 *
 * What we DON'T render: a per-session list with individual revoke.
 * The auth-js SDK does not expose listSessions on the admin client.
 * Per-session enumeration with last-activity / IP / UA would require
 * Supabase's Management API + a Personal Access Token, which is a
 * different auth tier than the app-server service-role key. Until
 * that's wired, the global / others revoke covers the user-protective
 * case (something looks wrong → kill everything but here) and the
 * /dashboard/settings audit feed shows recent sign-ins per IP/UA.
 *
 * Both actions require a 5-minute re-auth window. If the user has
 * been idle too long they're bounced back to a re-auth prompt with
 * a friendly notice; the sessions-actions module enforces this.
 */
export function SessionsPanel() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Active sessions</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Lost a phone? Worked on a borrowed laptop? Revoke any session other than this browser, or
          kill them all and start fresh. Both options ask you to sign in again before they run.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-canvas p-4">
        <form action={signOutOthers}>
          <Button type="submit" variant="secondary">
            Sign out other devices
          </Button>
          <p className="mt-2 text-[12.5px] text-ink-muted">
            Keeps this browser signed in; revokes every other session.
          </p>
        </form>
        <div className="h-px bg-line" />
        <form action={signOutEverywhere}>
          <Button type="submit" variant="ghost" className="text-claret hover:bg-claret/5">
            Sign out everywhere
          </Button>
          <p className="mt-2 text-[12.5px] text-ink-muted">
            Including this one. You&apos;ll be returned to the sign-in page.
          </p>
        </form>
      </div>

      <p className="px-1 text-[11.5px] text-ink-faint">
        A per-session list with individual revoke isn&apos;t available through Oria yet. The Recent
        activity feed below shows the IP and browser for every sign-in if something looks off.
      </p>
    </section>
  );
}
