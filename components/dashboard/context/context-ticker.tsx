import type { TickerItem } from "@/lib/daily/context-surface";

/**
 * The one reusable ticker for the per-context surface: a compact, horizontally
 * scrollable strip of live label/value pairs. Every archetype feeds it
 * different real values (renewals, events, holdings); the component is shared.
 * No auto-scroll, so it stays calm and respects reduced-motion by default.
 */
export function ContextTicker({ items }: { items: TickerItem[] }) {
  if (!items.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
