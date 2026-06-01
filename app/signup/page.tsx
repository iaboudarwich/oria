import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icon";
import { signUp } from "@/lib/auth/actions";
import { PasswordField } from "@/components/auth/password-field";

export const metadata = {
  title: "Sign up",
};

type Props = {
  searchParams: Promise<{ error?: string; email?: string; next?: string }>;
};

export default async function SignupPage({ searchParams }: Props) {
  const { error, email, next } = await searchParams;
  const t = await getTranslations("legal");

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-8">
          <Wordmark />
          <Link
            href="/"
            className="text-[13px] text-ink-muted hover:text-ink transition-base"
          >
            Back
          </Link>
        </div>
      </header>

      <main className="flex min-h-[calc(100vh-72px)] items-center justify-center px-6 py-12">
        <div className="w-full max-w-[360px] animate-fade-up">
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">
            Create your account
          </h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            A private workspace, kept for the long run. Nothing gets lost.
          </p>

          {error ? (
            <p className="mt-4 rounded-lg border border-claret/20 bg-claret/5 px-3 py-2 text-[12.5px] text-claret">
              {error}
            </p>
          ) : null}

          <form className="mt-6 space-y-3" action={signUp}>
            <input type="hidden" name="next" value={next ?? "/dashboard"} />
            <Field
              label="Name"
              type="text"
              name="full_name"
              placeholder="Your name"
              autoComplete="name"
            />
            <Field
              label="Email"
              type="email"
              name="email"
              defaultValue={email}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <PasswordField
              label="Password"
              name="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              minLength={8}
            />
            <label className="flex items-start gap-2 pt-1 text-[12.5px] text-ink-muted">
              <input
                type="checkbox"
                name="consent"
                required
                className="mt-0.5 h-4 w-4 accent-brand"
              />
              <span>
                {t.rich("consent", {
                  terms: (chunks) => (
                    <Link href="/terms" className="text-brand hover:opacity-80">
                      {chunks}
                    </Link>
                  ),
                  privacy: (chunks) => (
                    <Link href="/privacy" className="text-brand hover:opacity-80">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </label>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="mt-1 w-full"
            >
              Create account <ArrowRightIcon size={14} />
            </Button>
          </form>

          <p className="mt-6 text-center text-[12px] text-ink-faint">
            Already have an account?{" "}
            <Link href="/login" className="text-ink-muted hover:text-ink">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-ink-muted">{label}</span>
      <input
        {...rest}
        className="block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[16px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-ink"
      />
    </label>
  );
}
