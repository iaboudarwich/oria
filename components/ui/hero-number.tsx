import type { ReactNode } from "react";

/**
 * HeroNumber: the headline figure on a surface (heuristics §1.2 hierarchy
 * through scale, §1.3 tabular numerals so it never jitters on update). Display
 * type, tight tracking. Pair with an Eyebrow above and an optional inline label.
 * Server-safe.
 */
export function HeroNumber({
  value,
  label,
  className = "",
}: {
  value: ReactNode;
  label?: ReactNode;
  className?: string;
}) {
  return (
    <p className={`flex items-baseline gap-2 ${className}`}>
      <span className="font-display text-[clamp(28px,3.4vw,40px)] leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums">
        {value}
      </span>
      {label ? <span className="text-body-sm text-ink-muted">{label}</span> : null}
    </p>
  );
}
