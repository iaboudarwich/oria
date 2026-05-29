"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { dismissReprompt } from "@/lib/data/guided-onboarding-actions";

export function OnboardingRepromptBanner({ orgId }: { orgId: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  if (dismissed) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft/20 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink">
          Tell Oria about your life and it will help more.{" "}
          <span className="text-ink-muted">(2 minutes)</span>
        </p>
      </div>
      <Link
        href={`/onboarding/chat?mode=reprompt&workspace=${orgId}`}
        className="shrink-0 inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12px] text-surface hover:bg-ink-soft transition-base"
      >
        Start
      </Link>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          startTransition(() => void dismissReprompt("7d"));
        }}
        className="shrink-0 text-[11.5px] text-ink-muted hover:text-ink transition-base"
      >
        Later
      </button>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          startTransition(() => void dismissReprompt("permanent"));
        }}
        className="shrink-0 text-[11px] text-ink-faint hover:text-ink transition-base"
      >
        Don&apos;t show again
      </button>
    </div>
  );
}
