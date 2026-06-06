"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { dismissOnboardingReveal } from "@/app/onboarding/actions";

/**
 * One-time welcome overlay shown on the dashboard right after the user builds
 * their Oria. Dismissing it marks onboarding complete so it never returns.
 */
export function OnboardingReveal({
  name,
  gmailConnected,
}: {
  name: string;
  gmailConnected: boolean;
}) {
  const t = useTranslations("onboarding");
  const [open, setOpen] = useState(true);
  if (!open) return null;

  function dismiss() {
    setOpen(false);
    void dismissOnboardingReveal();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reveal-title"
      className="fixed inset-0 z-[160] flex items-center justify-center px-4 py-6"
    >
      <div
        aria-hidden
        onClick={dismiss}
        className="animate-fade-in absolute inset-0 bg-ink/45 backdrop-blur-sm"
      />
      <div className="animate-scale-in relative z-[161] w-full max-w-md rounded-2xl border border-line bg-surface-raised p-6 shadow-xl">
        <h2 id="reveal-title" className="text-title text-ink">
          {t("reveal_title", { name })}
        </h2>
        <p className="text-body mt-3 text-ink-soft">{t("reveal_body")}</p>
        <ul className="mt-4 space-y-2 text-[13px] text-ink-muted">
          <li className="flex gap-2">
            <span aria-hidden className="text-brand">
              •
            </span>
            {t("reveal_spaces")}
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-brand">
              •
            </span>
            {t("reveal_sections")}
          </li>
          {gmailConnected ? (
            <li className="flex gap-2">
              <span aria-hidden className="text-brand">
                •
              </span>
              {t("reveal_scan")}
            </li>
          ) : null}
        </ul>
        <button
          type="button"
          onClick={dismiss}
          className="transition-base mt-6 w-full rounded-xl bg-ink px-5 py-2.5 text-[14px] font-medium text-surface hover:bg-ink-soft"
        >
          {t("reveal_dismiss")}
        </button>
      </div>
    </div>
  );
}
