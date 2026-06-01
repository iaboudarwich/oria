import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { verifyAtSignIn } from "@/lib/auth/mfa-actions";

export const metadata = { title: "Two-factor code · Oria" };

type Props = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

/**
 * MFA gate that runs between password sign-in and dashboard. The
 * password step already validated the user; this page elevates the
 * session from AAL1 to AAL2 by verifying a TOTP or a backup code.
 *
 * Server-rendered (no client state). The form posts to
 * verifyAtSignIn(), which redirects to `next` on success or back here
 * with `?error=…` on failure. Rate limiting (5 / 15 min) sits in the
 * action.
 */
export default async function MfaPromptPage({ searchParams }: Props) {
  const { error, next } = await searchParams;
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";

  // Guard rails: only render if the user actually has a session AND
  // needs AAL2. A direct visit without a session bounces to /login;
  // an already-elevated user bounces straight to next.
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!(aal.data?.nextLevel === "aal2" && aal.data.currentLevel === "aal1")) {
    redirect(safeNext);
  }

  return (
    <div className="min-h-screen bg-canvas relative flex flex-col items-center justify-center px-4 py-12 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 -start-40 h-[600px] w-[600px] rounded-full bg-brand/5 blur-3xl" />
      </div>

      <div className="mb-8 relative z-10">
        <Wordmark />
      </div>

      <div className="relative z-10 w-full max-w-[400px] animate-scale-in">
        <div className="rounded-2xl border border-line bg-surface-raised shadow-xl px-8 py-8">
          <div className="mb-6 text-center">
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">
              Two-factor code
            </h1>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">
              Enter the 6-digit code from your authenticator app, or one of your backup codes.
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-claret/20 bg-claret/5 px-3.5 py-2.5 text-[13px] text-claret">
              {error}
            </div>
          ) : null}

          <form action={verifyAtSignIn} className="space-y-3.5">
            <input type="hidden" name="next" value={safeNext} />
            <label className="block">
              <span className="block mb-1.5 text-[12.5px] font-medium text-ink">
                Code
              </span>
              <input
                type="text"
                name="code"
                autoComplete="one-time-code"
                inputMode="text"
                placeholder="123456 or xxxxx-xxxxx"
                autoFocus
                required
                className="block h-11 w-full rounded-xl border border-line bg-canvas px-3 text-[16px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-brand focus:ring-[3px] focus:ring-brand/12"
              />
            </label>
            <Button type="submit" variant="primary" size="lg" className="w-full">
              Verify
            </Button>
          </form>

          <p className="mt-5 text-center text-[12px] text-ink-faint">
            <Link
              className="text-brand hover:opacity-80"
              href={`/login/mfa/recovery${
                safeNext !== "/dashboard"
                  ? `?next=${encodeURIComponent(safeNext)}`
                  : ""
              }`}
            >
              Lost access to your authenticator?
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
