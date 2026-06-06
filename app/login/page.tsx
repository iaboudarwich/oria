import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { ArrowRightIcon } from "@/components/ui/icon";
import { signIn, signInWithMagicLink } from "@/lib/auth/actions";
import { PasswordField } from "@/components/auth/password-field";
import { SubmitButton } from "@/components/auth/submit-button";

export const metadata = { title: "Sign in to Oria" };

type Props = {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    email?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { error, notice, email, next } = await searchParams;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-4 py-12">
      {/* Gradient orbs. premium background depth */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -start-40 -top-40 h-[600px] w-[600px] rounded-full bg-brand/5 blur-3xl" />
        <div className="absolute -end-20 -bottom-40 h-[400px] w-[400px] rounded-full bg-accent/8 blur-3xl" />
      </div>

      <div className="relative z-10 mb-8">
        <Wordmark />
      </div>

      <div className="animate-scale-in relative z-10 w-full max-w-[400px]">
        <div className="rounded-2xl border border-line bg-surface-raised px-8 py-8 shadow-xl">
          <div className="mb-6 text-center">
            <h1 className="text-[24px] font-semibold tracking-tight text-ink">Welcome back</h1>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">
              Your private AI for everything that matters.
            </p>
          </div>

          {notice && (
            <div className="mb-4 rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[13px] text-ink-soft">
              {notice}
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-xl border border-claret/20 bg-claret/5 px-3.5 py-2.5 text-[13px] text-claret">
              {error}
            </div>
          )}

          <form className="space-y-3.5" action={signIn}>
            <input type="hidden" name="next" value={next ?? "/dashboard"} />
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
              placeholder="Your password"
              autoComplete="current-password"
              required
              hint={
                <Link
                  href="/auth/forgot"
                  className="transition-base text-[12px] text-brand hover:opacity-80"
                >
                  Forgot password?
                </Link>
              }
            />
            <SubmitButton pendingLabel="Signing in" className="mt-1 w-full">
              Sign in <ArrowRightIcon size={14} />
            </SubmitButton>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] text-ink-faint">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <form action={signInWithMagicLink} className="space-y-2.5">
            <input type="hidden" name="next" value={next ?? "/dashboard"} />
            <MagicLinkField defaultEmail={email} />
            <button
              type="submit"
              className="transition-base flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line bg-canvas text-[13.5px] text-ink-muted hover:border-line-strong hover:bg-surface-raised hover:text-ink"
            >
              Send me a sign-in link
            </button>
          </form>

          <p className="mt-6 text-center text-[12.5px] text-ink-faint">
            New to Oria?{" "}
            <Link
              href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="transition-base font-medium text-brand hover:opacity-80"
            >
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  ...rest
}: { label: string; hint?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 flex items-center justify-between text-[12.5px] font-medium text-ink">
          <span>{label}</span>
          {hint}
        </span>
      )}
      <input
        {...rest}
        className="block h-11 w-full rounded-xl border border-line-strong bg-canvas px-3.5 text-[16px] text-ink transition-all duration-150 outline-none placeholder:text-ink-faint focus:border-brand focus:bg-surface-raised focus:shadow-[0_0_0_3px_rgba(91,95,221,0.12)]"
      />
    </label>
  );
}

function MagicLinkField({ defaultEmail }: { defaultEmail?: string }) {
  return (
    <label className="block">
      <input
        type="email"
        name="email"
        defaultValue={defaultEmail}
        placeholder="Email address for magic link"
        autoComplete="email"
        className="block h-11 w-full rounded-xl border border-line-strong bg-canvas px-3.5 text-[16px] text-ink transition-all duration-150 outline-none placeholder:text-ink-faint focus:border-brand focus:shadow-[0_0_0_3px_rgba(91,95,221,0.12)]"
      />
    </label>
  );
}
