"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

/**
 * Pure auto-grow policy: the textarea's height follows its content up to a max,
 * then it scrolls. Extracted so the behavior is testable without a DOM.
 */
export function resolveAutoGrow(
  contentPx: number,
  maxHeightPx: number,
): { heightPx: number; overflow: boolean } {
  const overflow = contentPx > maxHeightPx;
  return { heightPx: overflow ? maxHeightPx : contentPx, overflow };
}

type Props = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "rows" | "style"
> & {
  value: string;
  onChange: (value: string) => void;
  /** Initial / minimum visible rows. */
  minRows?: number;
  /** Grow up to this many rows, then scroll. */
  maxRows?: number;
};

/**
 * The single auto-grow composer primitive. One controlled `<textarea>` that
 * shows input immediately and grows with its content up to `maxRows`, then
 * scrolls. Used by Ask, the section text-log, the reminder title, and the Work
 * composer so every text entry behaves the same.
 *
 * a11y: a real `<textarea>`, so labelling (aria-label / id / placeholder),
 * keyboard, and IME all work; pass them straight through. Growth is downward
 * with no horizontal layout shift. RTL is inherited from the document `dir`.
 */
export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function AutoGrowTextarea(
    { value, onChange, minRows = 1, maxRows = 8, className = "", ...rest },
    forwardedRef,
  ) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    const setRefs = useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    const resize = useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto"; // reset so scrollHeight reflects content, not the prior height
      const cs = window.getComputedStyle(el);
      const line = parseFloat(cs.lineHeight) || 20;
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const borderY =
        (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
      const maxHeightPx = line * maxRows + padY + borderY;
      const { heightPx, overflow } = resolveAutoGrow(el.scrollHeight, maxHeightPx);
      el.style.height = `${heightPx}px`;
      el.style.overflowY = overflow ? "auto" : "hidden";
    }, [maxRows]);

    // Re-measure whenever the value changes (and on mount). useLayoutEffect runs
    // before paint, so the box never flashes at the wrong height.
    useLayoutEffect(() => {
      resize();
    }, [value, resize]);

    // A width change (rotate / resize) can re-wrap the text and change height.
    useEffect(() => {
      const onResize = () => resize();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, [resize]);

    return (
      <textarea
        ref={setRefs}
        value={value}
        rows={minRows}
        onChange={(e) => onChange(e.target.value)}
        className={`resize-none ${className}`}
        {...rest}
      />
    );
  },
);
