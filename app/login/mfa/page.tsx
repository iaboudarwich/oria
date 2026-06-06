import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isTrustedDevice } from "@/lib/auth/trusted-device";
import { verifyAtSignIn } from "@/lib/auth/mfa-actions";

export const metadata = { title: "Confirm it's you · Oria" };

type Props = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

/**
 * Sign-in step-up. The password step already validated the user; this confirms
 * it's them with a 6-digit code (or a backup code), elevating the session.
 *
 * It only appears when it genuinely matters: a verified second factor exists
 * AND this is not a trusted device. Everyday returning logins on a trusted
 * device skip it entirely (Round 16.7). The "remember this device" box trusts
 * the device on success so the step doesn't repeat here.
 */
export default async function MfaPromptPage({ searchParams }: Props) {
  const { error, next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");
  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const needsStepUp = aal.data?.nextLevel === "aal2" && aal.data.currentLevel === "aal1";
  // Already elevated, or no factor, or a trusted device: nothing to confirm.
  if (!needsStepUp || (await isTrustedDevice(userData.user.id))) {
    redirect(safeNext);
  }

  const t = await getTranslations("auth");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -start-40 -top-40 h-[600px] w-[600px] rounded-full bg-brand/5 blur-3xl" />
      </div>

      <div className="relative z-10 mb-8">
        <Wordmark />
      </div>

      <div className="animate-scale-in relative z-10 w-full max-w-[400px]">
        <div className="rounded-2xl border border-line bg-surface-raised px-8 py-8 shadow-xl">
          <div className="mb-6 text-center">
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">
              {t("signin_2fa_title")}
            </h1>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">{t("signin_2fa_help")}</p>
          </div>

          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-claret/20 bg-claret/5 px-3.5 py-2.5 text-[13px] text-claret"
            >
              {error}
            </div>
          ) : null}

          <form action={verifyAtSignIn} className="space-y-3.5">
            <input type="hidden" name="next" value={safeNext} />
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink">
                {t("signin_2fa_code_label")}
              </span>
              <input
                type="text"
                name="code"
                autoComplete="one-time-code"
                inputMode="text"
                placeholder="123456"
                autoFocus
                required
                className="transition-base block h-11 w-full rounded-xl border border-line bg-canvas px-3 text-[16px] text-ink outline-none placeholder:text-ink-faint focus:border-brand focus:ring-[3px] focus:ring-brand/12"
              />
            </label>

            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                name="remember_device"
                value="1"
                defaultChecked
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span className="min-w-0">
                <span className="block text-[12.5px] text-ink">{t("signin_2fa_remember")}</span>
                <span className="block text-[11.5px] text-ink-faint">
                  {t("signin_2fa_remember_help")}
                </span>
              </span>
            </label>

            <Button type="submit" variant="primary" size="lg" className="w-full">
              {t("signin_2fa_submit")}
            </Button>
          </form>

          <p className="mt-5 text-center text-[12px] text-ink-faint">
            <Link
              className="text-brand hover:opacity-80"
              href={`/login/mfa/recovery${
                safeNext !== "/dashboard" ? `?next=${encodeURIComponent(safeNext)}` : ""
              }`}
            >
              {t("signin_2fa_recovery")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
