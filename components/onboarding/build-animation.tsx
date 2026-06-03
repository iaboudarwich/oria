"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type BuildAnimationProps = {
  /** Section names to reveal one by one inside the ghost dashboard. */
  items: string[];
  /** Accent hex that washes across the skeleton in the personalization phase. */
  accent?: string | null;
  /** Total choreography length. Onboarding ~7s, reshape ~4.5s. */
  durationMs?: number;
  /** Fired once the choreography finishes (the caller also gates on real work). */
  onComplete: () => void;
};

function isHex(v: string | null | undefined): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim());
}

/**
 * The premium build moment. A ghost dashboard skeleton fades in, the tailored
 * section names appear one by one, an accent wash sweeps across, and a quiet
 * narrative progresses through four phases. The motion is restrained (opacity
 * fades, small slides, a gentle color wash). It runs on the client in parallel
 * with the real generation/execution work; the caller navigates away once both
 * this choreography and the real work have finished.
 *
 * Respects prefers-reduced-motion via CSS: the skeleton is hidden and only the
 * narrative line remains, still advancing through the phases (the timers run
 * regardless, so onComplete always fires).
 */
export function BuildAnimation({ items, accent, durationMs = 7000, onComplete }: BuildAnimationProps) {
  const t = useTranslations("build_anim");
  const [phase, setPhase] = useState(0); // 0..3
  const [revealed, setRevealed] = useState(0);
  const onCompleteRef = useRef(onComplete);

  // Keep the latest onComplete without re-running the timer effect (an inline
  // arrow from the caller changes identity every render).
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  const sections = items.slice(0, 6);
  const sectionCount = sections.length;
  const accentHex = isHex(accent) ? accent : null;

  useEffect(() => {
    const total = Math.max(2500, durationMs);
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase(1), total * 0.15));
    timers.push(setTimeout(() => setPhase(2), total * 0.6));
    timers.push(setTimeout(() => setPhase(3), total * 0.85));
    const start = total * 0.15;
    const span = total * 0.42;
    for (let i = 0; i < sectionCount; i++) {
      timers.push(setTimeout(() => setRevealed(i + 1), start + (span / Math.max(1, sectionCount)) * i));
    }
    timers.push(setTimeout(() => onCompleteRef.current(), total));
    return () => timers.forEach(clearTimeout);
  }, [durationMs, sectionCount]);

  const narrative = [t("phase1"), t("phase2"), t("phase3"), t("phase4")][phase];
  const washColor = accentHex ?? "var(--brand, #5B7CDD)";

  return (
    <div className="w-full max-w-md" role="status" aria-live="polite" aria-label={narrative}>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[0_2px_8px_-6px_rgba(28,26,23,0.12)] motion-reduce:hidden">
        <div className="flex">
          {/* Sidebar: section names settle into place one by one. */}
          <div className="w-1/3 space-y-2 border-r border-line p-3">
            <div className="h-2.5 w-3/4 rounded bg-line" />
            {sections.map((name, i) => (
              <div
                key={`${name}-${i}`}
                className={`flex items-center gap-1.5 transition-all duration-500 ${
                  i < revealed ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full transition-colors duration-700"
                  style={{ background: phase >= 3 ? washColor : "var(--line-strong, #d6d3cd)" }}
                />
                <span className="truncate text-[10px] text-ink-soft">{name}</span>
              </div>
            ))}
            {sections.length === 0 ? <div className="h-2 w-1/2 rounded bg-line" /> : null}
          </div>
          {/* Content: blocks settle in, then take on the accent. */}
          <div className="flex-1 space-y-2 p-3">
            <div className="h-2.5 w-1/2 rounded bg-line" />
            <div
              className={`h-12 rounded-lg border transition-all duration-700 ${
                phase >= 2 ? "bg-canvas" : "bg-surface"
              }`}
              style={{ borderColor: phase >= 3 ? `${accentHex ?? "#5B7CDD"}55` : "var(--line)" }}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-8 rounded bg-line/60" />
              <div className="h-8 rounded bg-line/60" />
            </div>
          </div>
        </div>
        {/* Accent wash sweeps in during personalization. */}
        <div
          className={`h-1 origin-left transition-all duration-700 ${
            phase >= 2 ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
          }`}
          style={{ background: washColor }}
        />
      </div>
      <p className="mt-4 text-center text-[14px] text-ink-soft transition-opacity duration-300">{narrative}</p>
    </div>
  );
}
