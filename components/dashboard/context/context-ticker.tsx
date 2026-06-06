import type { TickerItem } from "@/lib/daily/context-surface";

/**
 * The one reusable ticker for the per-context surface: a compact, horizontally
 * scrollable strip of live label/value pairs. Every archetype feeds it
 * different real values (renewals, events, holdings); the component is shared.
 * No auto-scroll, so it stays calm and respects reduced-motion by default.
 */
export function ContextTicker({ items, label }: { items: TickerItem[]; label: string }) {
  if (!items.length) return null;
  return (
    // tabIndex + role + label give the horizontally scrollable strip keyboard
    // access (WCAG: scrollable-region-focusable), since the chips inside are
    // not themselves focusable.
    <div
      tabIndex={0}
      role="group"
      aria-label={label}
      className="flex [scrollbar-width:none] gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((it, i) => (
        <span
          key={i}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12px]"
        >
          <span className="truncate text-ink">{it.label}</span>
          <span className="text-ink-faint">{it.value}</span>
        </span>
      ))}
    </div>
  );
}
