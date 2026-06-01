import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Cta =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

type EmptyStateProps = {
  /** A small lucide-style glyph. Rendered in a soft rounded tile. */
  icon?: ReactNode;
  headline: string;
  description?: string;
  cta?: Cta;
  /** Compact scale for empty states that sit inside a section/card rather
   *  than filling a whole page. */
  compact?: boolean;
  className?: string;
};

/**
 * The single shape every empty surface uses: a soft icon tile, a short
 * headline (.text-headline), one sentence of explanation (.text-body), and
 * at most one primary call to action. Centered in the available space.
 */
export function EmptyState({
  icon,
  headline,
  description,
  cta,
  compact = false,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-10" : "py-16"
      } ${className}`}
    >
      {icon ? (
        <div
          className={`mb-4 flex items-center justify-center rounded-2xl bg-sand/60 text-ink-muted ${
            compact ? "h-10 w-10" : "h-12 w-12"
          }`}
        >
          {icon}
        </div>
      ) : null}
      <h2 className={compact ? "text-title text-ink" : "text-headline text-ink"}>
        {headline}
      </h2>
      {description ? (
        <p className="mt-2 max-w-sm text-body text-ink-muted">{description}</p>
      ) : null}
      {cta ? (
        <div className="mt-5">
          {cta.href ? (
            <Button href={cta.href} variant="primary">
              {cta.label}
            </Button>
          ) : (
            <Button onClick={cta.onClick} variant="primary">
              {cta.label}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
