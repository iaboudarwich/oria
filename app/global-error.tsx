"use client";

// Root-level error boundary. Sits ABOVE the root layout, so it has no
// NextIntlClientProvider and cannot use translations: copy here is plain
// English by necessity. It must also bring its own <html>/<body> and
// global styles since it replaces the root layout entirely.

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reported, setReported] = useState(false);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  async function report() {
    if (reported) return;
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Root-level error boundary triggered.",
          context: {
            digest: error.digest ?? "none",
            url:
              typeof window !== "undefined"
                ? window.location.origin + window.location.pathname
                : "",
          },
        }),
      });
    } catch {
      // best-effort
    }
    setReported(true);
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center px-6">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface-raised p-8 text-center shadow-sm">
            <div className="flex items-center justify-center gap-2 text-ink">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-ink text-surface">
                <span className="text-[12px] font-semibold leading-none">O</span>
              </span>
              <span className="text-[17px] font-semibold tracking-tight">Oria</span>
            </div>
            <p className="mt-6 text-body text-ink-soft">
              Something went wrong on our end. We are looking into it.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-ink px-4 text-[13.5px] font-medium text-surface transition-base hover:bg-ink-soft"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={report}
                disabled={reported}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-line-strong bg-surface-raised px-4 text-[13.5px] font-medium text-ink transition-base hover:border-ink-muted disabled:opacity-50"
              >
                {reported ? "Thanks, we got it" : "Report this"}
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
