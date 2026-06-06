"use client";

import { useState } from "react";
import { CloseIcon } from "@/components/ui/icon";
import { dismissHint } from "@/lib/data/onboarding-actions";
import type { HintKey } from "@/lib/data/onboarding";

/**
 * One-time dismissible onboarding hint card.
 *
 * The server evaluates should_show before rendering, so there's no
 * client-side flash. if the user already dismissed it, the component
 * is simply never sent to the browser.
 *
 * Dismiss paths:
 *   • Clicking × closes it immediately (optimistic) and fires the
 *     server action in the background.
 *   • Clicking the semi-transparent backdrop does the same.
 */
export function Hint({
  hintKey,
  title,
  body,
  shouldShow,
  mobileOnly = false,
}: {
  hintKey: HintKey;
  title: string;
  body: string;
  /** Server-evaluated. pass false to suppress without mounting. */
  shouldShow: boolean;
  /**
   * When true, hide on screens ≥ 768 px via CSS (md:hidden).
   * No JS viewport check needed. avoids set-state-in-effect lint rule
   * and avoids hydration mismatches.
   */
  mobileOnly?: boolean;
}) {
  const [visible, setVisible] = useState(shouldShow);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    void dismissHint(hintKey);
  }

  // When mobileOnly, the fixed elements carry md:hidden so they're
  // invisible on desktop without any JS viewport check.
  const hiddenOnDesktop = mobileOnly ? "md:hidden" : "";

  return (
    <>
      {/* Backdrop. click anywhere outside the card to dismiss */}
      <div
        className={`animate-fade-in fixed inset-0 z-40 bg-ink/10 ${hiddenOnDesktop}`}
        onClick={dismiss}
        aria-hidden
      />

      {/* Card */}
      <div
        role="dialog"
        aria-label={title}
        className={`animate-fade-up fixed right-6 bottom-6 z-50 w-80 rounded-2xl border border-line bg-surface-raised shadow-lg ${hiddenOnDesktop}`}
      >
        <div className="flex items-start gap-3 p-4">
          <div className="flex-1">
            <p className="text-[13.5px] font-medium text-ink">{title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{body}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="transition-base shrink-0 rounded-lg p-1 text-ink-faint hover:bg-surface hover:text-ink"
          >
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="border-t border-line px-4 py-2.5">
          <button
            type="button"
            onClick={dismiss}
            className="transition-base text-[12px] text-ink-muted hover:text-ink"
          >
            Got it
          </button>
        </div>
      </div>
    </>
  );
}
