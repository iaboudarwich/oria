"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { dismissReprompt } from "@/lib/data/guided-onboarding-actions";

export function OnboardingRepromptBanner() {
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
        href="/onboarding/demo"
        className="transition-base inline-flex h-8 shrink-0 items-center rounded-lg bg-ink px-3 text-[12px] text-surface hover:bg-ink-soft"
      >
        Start
      </Link>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          startTransition(() => void dismissReprompt("7d"));
        }}
        className="transition-base shrink-0 text-[11.5px] text-ink-muted hover:text-ink"
      >
        Later
      </button>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          startTransition(() => void dismissReprompt("permanent"));
        }}
        className="transition-base shrink-0 text-[11px] text-ink-faint hover:text-ink"
      >
        Don&apos;t show again
      </button>
    </div>
  );
}
