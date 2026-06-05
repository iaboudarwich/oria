"use client";

import { useEffect, useRef } from "react";

type Options = {
  /** Move focus to the element. Default true. */
  focus?: boolean;
  /** Scroll the element into view (skipped when it is already fully visible). Default true. */
  scroll?: boolean;
  /** Vertical alignment when scrolling. Default "center". */
  block?: ScrollLogicalPosition;
  /** Delay before acting, to let paint/animation settle. Default 60ms. */
  delay?: number;
  /** Gate the behavior off without changing hook order. Default true. */
  enabled?: boolean;
};

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_QUERY).matches;
}

function isFullyVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  return r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw;
}

/**
 * Focus the next action. Attach the returned ref to the primary action or next
 * step of a flow; whenever `trigger` changes to a new defined value (a new step
 * appearing, a modal opening), the element is scrolled into view and given
 * focus, so the user never has to hunt for the next button.
 *
 * Accessibility + restraint:
 * - Only acts on a CHANGE of `trigger` (an appearance), never on every render,
 *   so it does not fight a user who has scrolled away mid-step.
 * - Skips the scroll entirely when the element is already fully on screen.
 * - Moves focus without trapping it; a non-focusable container gets a
 *   `tabindex="-1"` so it can receive focus and be announced, then released.
 * - Honors prefers-reduced-motion (instant scroll, no smooth animation).
 * - Vertical scroll only, so it is correct under RTL.
 */
export function useFocusNext<T extends HTMLElement = HTMLElement>(
  trigger: unknown,
  options: Options = {},
) {
  const { focus = true, scroll = true, block = "center", delay = 60, enabled = true } = options;
  const ref = useRef<T | null>(null);
  const last = useRef<unknown>(undefined);

  useEffect(() => {
    if (!enabled) return;
    // A null/undefined/false trigger means "nothing has appeared"; do nothing.
    if (trigger === undefined || trigger === null || trigger === false) return;
    // Only react to a real transition, so we never yank focus on a re-render.
    if (Object.is(trigger, last.current)) return;
    last.current = trigger;

    const id = window.setTimeout(() => {
      const el = ref.current;
      if (!el || typeof window === "undefined") return;
      const reduced = prefersReducedMotion();

      if (scroll && !isFullyVisible(el)) {
        try {
          el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block, inline: "nearest" });
        } catch {
          el.scrollIntoView();
        }
      }

      if (focus) {
        const nativelyFocusable = el.matches(
          "a[href],button,input,textarea,select,[tabindex]",
        );
        if (!nativelyFocusable && !el.hasAttribute("tabindex")) {
          el.setAttribute("tabindex", "-1");
        }
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
      }
    }, delay);

    return () => window.clearTimeout(id);
  }, [trigger, enabled, focus, scroll, block, delay]);

  return ref;
}
