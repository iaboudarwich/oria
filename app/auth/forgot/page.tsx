import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "@/lib/auth/actions";

export const metadata = { title: "Reset your password" };

type Props = {
  searchParams: Promise<{ sent?: string; email?: string; error?: string }>;
};

export default async function ForgotPage({ searchParams }: Props) {
  const { sent, email, error } = await searchParams;
  const t = await getTranslations("auth");

  if (sent) {
    return (
      <AuthShell
        title={t("forgot_title")}
        subtitle={t("forgot_sent", { email: email ?? "that address" })}
      >
        <div className="mt-6 text-center">
          <Link href="/login" className="text-body-sm text-brand hover:opacity-80">
            {t("forgot_back")}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("forgot_title")} subtitle={t("forgot_body")}>
      {error ? (
        <p className="mt-4 rounded-xl border border-claret/20 bg-claret/5 px-3.5 py-2.5 text-[13px] text-claret">
          {error}
        </p>
      ) : null}
      <form className="mt-6 space-y-3" action={requestPasswordReset}>
        <label className="block">
          <span className="mb-1.5 block text-[12px] text-ink-muted">
            {t("email_label")}
          </span>
          <input
            type="email"
            name="email"
            required
            placeholder="you@example.com"
            autoComplete="email"
            className="block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[16px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-ink"
          />
        </label>
        <Button type="submit" variant="primary" size="lg" className="w-full">
          {t("forgot_submit")}
        </Button>
      </form>
      <div className="mt-5 text-center">
        <Link href="/login" className="text-[12.5px] text-ink-faint hover:text-ink">
          {t("forgot_back")}
        </Link>
      </div>
    </AuthShell>
  );
}
