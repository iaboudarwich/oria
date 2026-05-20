import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { joinByCode } from "@/lib/data/invite-accept";
import { ArrowRightIcon } from "@/components/ui/icon";

export const metadata = { title: "Join a circle" };

type PageProps = {
  searchParams: Promise<{ error?: string; code?: string }>;
};

export default async function JoinByCodePage({ searchParams }: PageProps) {
  const { error, code } = await searchParams;

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
        <div className="w-full max-w-[400px] animate-fade-up">
          <p className="text-[11.5px] uppercase tracking-[0.12em] text-ink-faint">
            Join a circle
          </p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-ink">
            Enter your invite code
          </h1>
          <p className="mt-2 text-[13.5px] text-ink-muted">
            Type the 8-character code your circle owner shared with you. Codes
            look like <span className="font-mono">XXXX-XXXX</span>.
          </p>

          {error ? (
            <p className="mt-4 rounded-lg border border-claret/20 bg-claret/5 px-3 py-2 text-[12.5px] text-claret">
              We couldn&apos;t find that invite. Check the code and try again.
            </p>
          ) : null}

          <form action={joinByCode} className="mt-6">
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-ink-muted">
                Invite code
              </span>
              <input
                type="text"
                name="code"
                defaultValue={code ?? ""}
                required
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="ABCD-2345"
                className="block h-12 w-full rounded-xl border border-line-strong bg-surface-raised px-4 text-center font-mono text-[16px] tracking-[0.15em] text-ink uppercase placeholder:text-ink-faint outline-none transition-base focus:border-ink"
              />
            </label>

            <button
              type="submit"
              className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-ink text-[14px] text-surface transition-base hover:bg-ink-soft"
            >
              Continue <ArrowRightIcon size={14} />
            </button>
          </form>

          <p className="mt-6 text-center text-[12px] text-ink-faint">
            Got a full invite link?{" "}
            <span className="text-ink-muted">Just open it directly.</span>
          </p>
        </div>
      </main>
    </div>
  );
}
