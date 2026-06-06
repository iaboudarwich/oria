"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { recordTwoFactorPrompt } from "@/lib/auth/prompt-actions";

const SEEN_KEY = "oria:2fa_prompt_seen";

/**
 * One-time post-signup encouragement to enable two-factor auth. Shows once per
 * device (localStorage) for users who have not enrolled, and never again after
 * "Maybe later" unless they revisit Settings. Both outcomes are audited.
 */
export function TwoFactorPrompt({ enrolled }: { enrolled: boolean }) {
  const t = useTranslations("twofa");
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (enrolled) return;
    // Deferred to a task so we are not calling setState synchronously inside
    // the effect (and so localStorage is only touched on the client).
    const id = window.setTimeout(() => {
      let seen = false;
      try {
        seen = localStorage.getItem(SEEN_KEY) === "1";
      } catch {
        seen = false;
      }
      if (seen) return;
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        // ignore
      }
      setOpen(true);
      void recordTwoFactorPrompt("shown");
    }, 0);
    return () => window.clearTimeout(id);
  }, [enrolled]);

  if (!open) return null;

  function dismiss() {
    setOpen(false);
    void recordTwoFactorPrompt("dismissed");
  }

  function setUp() {
    setOpen(false);
    router.push("/dashboard/settings?tab=security");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="twofa-prompt-title"
      className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6"
    >
      <div
        aria-hidden
        onClick={dismiss}
        className="animate-fade-in absolute inset-0 bg-ink/40 backdrop-blur-sm"
      />
      <div className="animate-scale-in relative z-[121] w-full max-w-md rounded-2xl border border-line bg-surface-raised p-6 shadow-xl">
        <h2 id="twofa-prompt-title" className="text-title text-ink">
          {t("title")}
        </h2>
        <p className="text-body mt-3 text-ink-soft">{t("body")}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="transition-base text-[12.5px] text-ink-faint hover:text-ink"
          >
            {t("later")}
          </button>
          <button
            type="button"
            onClick={setUp}
            className="transition-base inline-flex h-10 items-center justify-center rounded-xl bg-ink px-4 text-[13.5px] font-medium text-surface hover:bg-ink-soft"
          >
            {t("setup")}
          </button>
        </div>
      </div>
    </div>
  );
}
