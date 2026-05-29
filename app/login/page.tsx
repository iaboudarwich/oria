import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@/components/ui/icon";
import { signIn, signInWithMagicLink } from "@/lib/auth/actions";
import { PasswordField } from "@/components/auth/password-field";

export const metadata = {
  title: "Sign in",
};

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
            Sign in
          </h1>

          {notice ? (
            <p className="mt-4 rounded-lg border border-line bg-surface-raised px-3 py-2 text-[12.5px] text-ink-soft">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 rounded-lg border border-claret/20 bg-claret/5 px-3 py-2 text-[12.5px] text-claret">
              {error}
            </p>
          ) : null}

          <form className="mt-6 space-y-3" action={signIn}>
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
                  href="#"
                  className="text-[12px] text-ink-muted hover:text-ink transition-base"
                >
                  Forgot?
                </Link>
              }
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="mt-1 w-full"
            >
              Continue <ArrowRightIcon size={14} />
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] text-ink-faint">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <form action={signInWithMagicLink}>
            <input type="hidden" name="next" value={next ?? "/dashboard"} />
            <MagicLinkField defaultEmail={email} />
            <button
              type="submit"
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[13.5px] text-ink-soft transition-base hover:border-line-strong hover:text-ink"
            >
              Email me a sign-in link
            </button>
          </form>

          <p className="mt-8 text-center text-[12px] text-ink-faint">
            New to Oria?{" "}
            <Link
              href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="text-ink-muted hover:text-ink"
            >
              Create account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  hint,
  ...rest
}: {
  label: string;
  hint?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-[12px] text-ink-muted">
        <span>{label}</span>
        {hint}
      </span>
      <input
        {...rest}
        className="block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[16px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-ink"
      />
    </label>
  );
}

function MagicLinkField({ defaultEmail }: { defaultEmail?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-ink-muted">Or use a link</span>
      <input
        type="email"
        name="email"
        defaultValue={defaultEmail}
        placeholder="you@example.com"
        className="block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[16px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-ink"
      />
    </label>
  );
}
