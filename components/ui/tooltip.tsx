"use client";

import {
  cloneElement,
  useId,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

type Side = "top" | "bottom";

/**
 * Bespoke accessible tooltip (Round: perceived performance, Part 4). We build
 * our own instead of Radix/shadcn (heuristics principle 10: no third-party UI
 * framework chrome); it is a thin wrapper, not a positioning engine.
 *
 * - Shows on hover AND keyboard focus (focus-within), so keyboard users get it.
 * - Dismissible with Escape; reappears on the next hover/focus.
 * - The label is linked to the trigger via aria-describedby and is ALWAYS in the
 *   DOM (role="tooltip"), so a screen reader announces it on focus even when the
 *   visual bubble is hidden. The tooltip is an ENHANCEMENT: the trigger keeps
 *   its own aria-label, so meaning never lives only in the hover.
 * - On touch (no hover) the bubble simply does not appear; the aria-label
 *   carries the meaning. Copy is one short line, passed in already localized.
 */
export function Tooltip({
  label,
  side = "top",
  children,
}: {
  label: string;
  side?: Side;
  children: ReactElement<{ "aria-describedby"?: string }>;
}) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);

  const trigger = cloneElement(children, { "aria-describedby": id });

  function onKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
    if (e.key === "Escape") setDismissed(true);
  }

  const pos =
    side === "top"
      ? "bottom-full mb-1.5 left-1/2 -translate-x-1/2"
      : "top-full mt-1.5 left-1/2 -translate-x-1/2";

  return (
    <span
      className="group relative inline-flex"
      onKeyDown={onKeyDown}
      onMouseLeave={() => setDismissed(false)}
      onBlur={() => setDismissed(false)}
    >
      {trigger}
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none absolute z-50 rounded-md border border-line-strong bg-surface-floating px-2 py-1 text-[11.5px] font-medium whitespace-nowrap text-ink opacity-0 shadow-lg transition-opacity duration-150 ${pos} ${
          dismissed ? "" : "group-focus-within:opacity-100 group-hover:opacity-100"
        }`}
      >
        {label}
      </span>
    </span>
  );
}

/** Convenience: an icon-only button that already carries a tooltip + aria-label.
 *  The label feeds BOTH aria-label and the tooltip, so the two never drift. */
export function IconButtonWithTooltip({
  label,
  onClick,
  side,
  className = "",
  children,
  disabled,
  type = "button",
}: {
  label: string;
  onClick?: () => void;
  side?: Side;
  className?: string;
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <Tooltip label={label} side={side}>
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={className}
      >
        {children}
      </button>
    </Tooltip>
  );
}
