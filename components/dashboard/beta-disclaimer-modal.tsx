"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { acknowledgeBetaDisclaimer } from "@/lib/data/beta-disclaimer-actions";

/**
 * Modal shown once per account, on first dashboard load. Persists the
 * acknowledgement to profiles.beta_disclaimer_acknowledged_at so it
 * never reappears. "I understand" is the only path out. There's no
 * close-without-acknowledging escape: the layout doesn't render the
 * modal once the flag is set, so dismissing it means setting the flag.
 *
 * Renders as an overlay with a backdrop. Server-side check in the
 * layout decides whether to mount this at all, so it costs zero
 * client JS for users who've already acknowledged.
 */
export function BetaDisclaimerModal() {
  const [ack, setAck] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function dismiss() {
    if (!ack || pending) return;
    startTransition(async () => {
      await acknowledgeBetaDisclaimer();
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="beta-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6"
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-fade-in"
      />
      <div className="relative z-[101] w-full max-w-md rounded-2xl border border-line bg-surface-raised p-6 shadow-xl animate-scale-in">
        <h2
          id="beta-modal-title"
          className="text-[18px] font-semibold tracking-tight text-ink"
        >
          One thing before we start
        </h2>
        <div className="mt-3 space-y-3 text-[13.5px] text-ink-soft">
          <p>
            Oria is in <span className="font-medium text-ink">beta</span>.
            Your data is encrypted in transit and at rest, but we have
            not yet been professionally audited.
          </p>
          <p>
            Please don&apos;t upload anything you couldn&apos;t afford to
            lose, leak, or recreate. You can reset or delete your account
            at any time from{" "}
            <Link
              href="/dashboard/settings?tab=privacy"
              className="text-brand hover:opacity-80"
            >
              Settings → Privacy
            </Link>
            .
          </p>
          <p>
            Found a security issue? Email{" "}
            <a
              href="mailto:security@heyoria.com"
              className="text-brand hover:opacity-80"
            >
              security@heyoria.com
            </a>
            . Details + scope live on the{" "}
            <Link
              href="/security"
              className="text-brand hover:opacity-80"
              prefetch={false}
            >
              security page
            </Link>
            .
          </p>
        </div>

        <label className="mt-5 flex items-start gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-brand"
          />
          I understand and want to continue.
        </label>

        <div className="mt-5 flex justify-end">
          <Button
            onClick={dismiss}
            variant="primary"
            disabled={!ack || pending}
          >
            {pending ? "Continuing…" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
