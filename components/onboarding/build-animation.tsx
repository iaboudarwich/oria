"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import type { Callout } from "@/lib/onboarding/callouts";

type BuildAnimationProps = {
  /** Section names to reveal one by one inside the ghost dashboard. */
  items: string[];
  /** Up to three callouts naming the user's REAL answers, revealed one by one. */
  callouts?: Callout[];
  /** Accent hex that washes across the skeleton in the personalization phase. */
  accent?: string | null;
  /** Total choreography length. Onboarding ~12s, reshape ~4.5s. */
  durationMs?: number;
  /** Fired once the choreography finishes (the caller also gates on real work). */
  onComplete: () => void;
};

function isHex(v: string | null | undefined): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim());
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/** True when the OS asks for reduced motion. Subscribes via useSyncExternalStore
 *  so there is no setState-in-effect; server snapshot is false. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => (typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(REDUCED_QUERY).matches),
    () => false,
  );
}

/** Render one callout's copy: real section + real reason, or section-only. */
function CalloutLine({ c }: { c: Callout }) {
  const t = useTranslations("build_anim");
  return (
    <span>
      {c.reason ? t("callout", { section: c.section, reason: c.reason }) : t("callout_plain", { section: c.section })}
    </span>
  );
}

/**
 * Coordinates the build animation with the real async work. Both run in
 * parallel; the caller leaves only once both have settled. Used by the
 * onboarding preview and the reshape engine so the gating logic lives once.
 */
export function useBuildGate() {
  const animDone = useRef(false);
  const execOk = useRef<boolean | null>(null);
  return {
    /** Call before kicking off a new build. */
    reset() {
      animDone.current = false;
      execOk.current = null;
    },
    /** The animation choreography finished. */
    signalAnim() {
      animDone.current = true;
    },
    /** The real execution resolved (ok or failed). */
    signalExec(ok: boolean) {
      execOk.current = ok;
    },
    /** "success" / "error" once both have settled, else null. */
    ready(): "success" | "error" | null {
      if (!animDone.current || execOk.current === null) return null;
      return execOk.current ? "success" : "error";
    },
  };
}

/**
 * The premium build moment (~12s). A ghost dashboard skeleton fades in, the
 * tailored section names settle one by one, an accent wash sweeps across, and
 * three callouts assemble below, each naming a REAL section and a REAL answer
 * ("Adding Lease and landlord, because you mentioned renting"). It runs in
 * parallel with the real generation/execution; the caller leaves once both this
 * choreography and the real work have finished (useBuildGate).
 *
 * Reduced motion (heuristics §11): the skeleton is hidden via CSS and the end
 * state is derived in render (all callouts shown at once), with the effect
 * scheduling only a quick finish, so there is no motion and onComplete still
 * fires.
 */
export function BuildAnimation({ items, callouts = [], accent, durationMs = 12000, onComplete }: BuildAnimationProps) {
  const t = useTranslations("build_anim");
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState(0); // 0..3 accent progression
  const [revealedSections, setRevealedSections] = useState(0);
  const [revealedCallouts, setRevealedCallouts] = useState(0);
  const onCompleteRef = useRef(onComplete);

  // Keep the latest onComplete without re-running the timer effect (an inline
  // arrow from the caller changes identity every render).
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  const sections = items.slice(0, 6);
  const sectionCount = sections.length;
  const shownCallouts = callouts.slice(0, 3);
  const calloutCount = shownCallouts.length;
  const accentHex = isHex(accent) ? accent : null;
  const washColor = accentHex ?? "var(--brand, #5B7CDD)";

  useEffect(() => {
    // Reduced motion: skip the choreography. The end state is derived in render
    // (everything visible), so the effect only schedules the quick finish, no
    // motion and no synchronous state writes (heuristics §11).
    if (reduced) {
      const tmr = setTimeout(() => onCompleteRef.current(), 900);
      return () => clearTimeout(tmr);
    }

    const total = Math.max(2500, durationMs);
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase(1), total * 0.12));
    timers.push(setTimeout(() => setPhase(2), total * 0.5));
    timers.push(setTimeout(() => setPhase(3), total * 0.78));
    // Sections settle in over the first half.
    const sStart = total * 0.1;
    const sSpan = total * 0.45;
    for (let i = 0; i < sectionCount; i++) {
      timers.push(setTimeout(() => setRevealedSections(i + 1), sStart + (sSpan / Math.max(1, sectionCount)) * i));
    }
    // The three answer callouts assemble across the run, each with room to read.
    const calloutAt = [0.16, 0.46, 0.74];
    for (let i = 0; i < calloutCount; i++) {
      timers.push(setTimeout(() => setRevealedCallouts(i + 1), total * (calloutAt[i] ?? 0.85)));
    }
    timers.push(setTimeout(() => onCompleteRef.current(), total));
    return () => timers.forEach(clearTimeout);
  }, [reduced, durationMs, sectionCount, calloutCount]);

  // Under reduced motion everything is shown at once (the end state); otherwise
  // it tracks the phased reveal.
  const shownPhase = reduced ? 3 : phase;
  const shownSections = reduced ? sectionCount : revealedSections;
  const shownCalloutCount = reduced ? calloutCount : revealedCallouts;

  return (
    <div className="w-full max-w-md">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[0_2px_8px_-6px_rgba(28,26,23,0.12)] motion-reduce:hidden">
        <div className="flex">
          {/* Sidebar: section names settle into place one by one. */}
          <div className="w-1/3 space-y-2 border-r border-line p-3">
            <div className="h-2.5 w-3/4 rounded bg-line" />
            {sections.map((name, i) => (
              <div
                key={`${name}-${i}`}
                className={`flex items-center gap-1.5 transition-all duration-500 ${
                  i < shownSections ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full transition-colors duration-700"
                  style={{ background: shownPhase >= 3 ? washColor : "var(--line-strong, #d6d3cd)" }}
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
                shownPhase >= 2 ? "bg-canvas" : "bg-surface"
              }`}
              style={{ borderColor: shownPhase >= 3 ? `${accentHex ?? "#5B7CDD"}55` : "var(--line)" }}
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
            shownPhase >= 2 ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
          }`}
          style={{ background: washColor }}
        />
      </div>

      {/* The callouts: each names a real section and a real answer, assembling
       *  the user's Oria in their own words. Announced politely. */}
      <p className="mt-5 text-center text-eyebrow">{t("assembling")}</p>
      <ul className="mt-2 space-y-1.5" role="status" aria-live="polite">
        {shownCallouts.map((c, i) => (
          <li
            key={`${c.section}-${i}`}
            className={`text-center text-[13.5px] leading-snug text-ink-soft transition-all duration-500 ${
              i < shownCalloutCount ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
            }`}
          >
            <CalloutLine c={c} />
          </li>
        ))}
        {calloutCount === 0 ? (
          <li className="text-center text-[13.5px] text-ink-soft">{t("assembling_plain")}</li>
        ) : null}
      </ul>
    </div>
  );
}
