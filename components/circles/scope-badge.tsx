import type { ItemScope } from "@/lib/circles/scope";

/**
 * Plain-language scope badge: "Private" or "Shared with {circle}", the circle's
 * name carried in its own accent color. No jargon, no policy talk. The label is
 * passed in already localized; this only renders it with the right tone + dot.
 */
export function ScopeBadge({ scope, label }: { scope: ItemScope; label: string }) {
  if (scope.kind === "private") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas px-2 py-0.5 text-[10.5px] text-ink-muted">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-raised px-2 py-0.5 text-[10.5px] text-ink-soft">
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: scope.circleColor ?? "var(--brand)" }}
      />
      {label}
    </span>
  );
}
