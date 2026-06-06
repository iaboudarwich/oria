"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { dismissHint } from "@/lib/data/onboarding-actions";

export const TOUR_OPEN_EVENT = "oria:tour-open";

const STEPS = ["upload", "connect", "ask", "browse", "manage"] as const;

/**
 * A short, skippable five-step tour of the core moves. Shows once after
 * onboarding (gated by the 'feature_tour' onboarding key, passed as
 * initialOpen), and can be re-opened anytime from the feature index. Finishing
 * or skipping marks it seen so it never auto-shows again.
 */
export function FeatureTour({ initialOpen }: { initialOpen: boolean }) {
  const t = useTranslations("tour");
  const [open, setOpen] = useState(initialOpen);
  const [step, setStep] = useState(0);

  useEffect(() => {
    function reopen() {
      setStep(0);
      setOpen(true);
    }
    window.addEventListener(TOUR_OPEN_EVENT, reopen);
    return () => window.removeEventListener(TOUR_OPEN_EVENT, reopen);
  }, []);

  function finish() {
    setOpen(false);
    void dismissHint("feature_tour");
  }

  if (!open) return null;

  const key = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      className="fixed inset-0 z-[150] flex items-center justify-center px-4 py-6"
    >
      <div
        aria-hidden
        onClick={finish}
        className="animate-fade-in absolute inset-0 bg-ink/40 backdrop-blur-sm"
      />
      <div className="animate-scale-in relative z-[151] w-full max-w-md rounded-2xl border border-line bg-surface-raised p-6 shadow-xl">
        <p className="text-[11.5px] font-semibold tracking-[0.08em] text-ink-faint uppercase">
          {t("step_of", { current: step + 1, total: STEPS.length })}
        </p>
        <h2 id="tour-title" className="text-title mt-1 text-ink">
          {t(`${key}.title`)}
        </h2>
        <p className="text-body mt-2 text-ink-soft">{t(`${key}.body`)}</p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="transition-base text-[12.5px] text-ink-faint hover:text-ink"
          >
            {t("skip")}
          </button>
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="transition-base rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-surface"
              >
                {t("back")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
              className="transition-base rounded-lg bg-ink px-3.5 py-1.5 text-[12.5px] font-medium text-surface hover:bg-ink-soft"
            >
              {isLast ? t("done") : t("next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
