import type { ReactNode } from "react";

/**
 * Horizontally swipeable stack for sibling objects (accounts, cards, metrics).
 * CSS scroll-snap, thumb-friendly, no library. The scrollbar is hidden but the
 * region is keyboard-focusable and labelled (WCAG scrollable-region). RTL is
 * inherited from the document `dir` (the browser flips the scroll axis). Pair
 * each item's body with an Accordion for expand-in-place detail and a Sheet for
 * per-card actions (Round 16.9 primitives).
 */
export function CardStack({
  children,
  ariaLabel,
  className = "",
}: {
  children: ReactNode;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      className={`-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  );
}

/** One card in the stack. Defaults to ~85% width on phone (a peek of the next),
 *  a fixed width on larger screens. Override with `className`. */
export function CardStackItem({
  children,
  className = "w-[85%] sm:w-[320px]",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`shrink-0 snap-start ${className}`}>{children}</div>;
}
