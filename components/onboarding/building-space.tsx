"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

const STAGE_KEYS = ["build_stage_1", "build_stage_2", "build_stage_3", "build_stage_4"] as const;
const STEP_MS = 1500;

/**
 * The "building your space" loading screen. Replaces the plain onboarding
 * spinner with a staged, on-brand sequence that conveys real work happening:
 * Oria reads the answers, chooses sections, shapes the spaces. It is purely a
 * loader (it does not gate the real work); the parent unmounts it when the work
 * is done, so the stages advance and then hold on the last one calmly.
 *
 * Reduced motion: shows every stage at once with a calm line, no animation.
 */
export function BuildingSpace() {
  const t = useTranslations("onboarding");
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduced) return; // reduced motion: render every stage at once, no timer.
    // Advance through the stages, then hold on the last one.
    const id = window.setInterval(() => {
      setTick((s) => (s < STAGE_KEYS.length - 1 ? s + 1 : s));
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  // Under reduced motion, show all stages complete; otherwise follow the tick.
  const stage = reduced ? STAGE_KEYS.length - 1 : tick;

  return (
    <div
      className="flex w-full max-w-sm flex-col items-center gap-6 text-center"
      role="status"
      aria-live="polite"
      aria-label={t("build_title")}
    >
      {/* Breathing brand mark. Frozen flat under reduced motion. */}
      <div className="relative h-12 w-12">
        <span
          className={`absolute inset-0 rounded-full bg-brand/15 ${reduced ? "" : "animate-ping"}`}
          aria-hidden
        />
        <span className="absolute inset-[6px] rounded-full bg-brand/30" aria-hidden />
        <span className="absolute inset-[14px] rounded-full bg-brand" aria-hidden />
      </div>

      <p className="text-[17px] font-semibold tracking-tight text-ink">{t("build_title")}</p>

      <ul className="w-full space-y-2 text-left">
        {STAGE_KEYS.map((key, i) => {
          const done = reduced || i < stage;
          const active = !reduced && i === stage;
          return (
            <li key={key} className="flex items-center gap-2.5">
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] transition-base ${
                  done
                    ? "bg-brand text-surface"
                    : active
                      ? "border-2 border-brand"
                      : "border border-line-strong"
                }`}
                aria-hidden
              >
                {done ? "✓" : ""}
              </span>
              <span
                className={`text-[13.5px] transition-base ${
                  done || active ? "text-ink-soft" : "text-ink-faint"
                }`}
              >
                {t(key)}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Calm progress sweep (hidden under reduced motion via the motion utility). */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
          style={{ width: `${((Math.min(stage, STAGE_KEYS.length - 1) + 1) / STAGE_KEYS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
