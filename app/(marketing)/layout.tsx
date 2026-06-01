import type { ReactNode } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

/**
 * Chrome for the public marketing/legal pages (privacy, terms). A thin
 * header with the wordmark and a footer that always exposes the legal
 * and security links. The landing page (app/page.tsx) keeps its own
 * bespoke footer; this is for the standalone document pages.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Wordmark href="/" />
          <Link
            href="/login"
            className="text-body-sm text-ink-muted transition-base hover:text-ink"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8 text-body-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <Wordmark />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/privacy" className="transition-base hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="transition-base hover:text-ink">
              Terms
            </Link>
            <Link
              href="/security"
              prefetch={false}
              className="transition-base hover:text-ink"
            >
              Security
            </Link>
            <a
              href="mailto:hi@heyoria.com"
              className="transition-base hover:text-ink"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
