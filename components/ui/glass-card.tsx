import type { ReactNode } from "react";

/**
 * GlassCard: the default surface (heuristics §1.5, §7). Floats through
 * transparency over the living background, not elevation, so no heavy shadow.
 * Padding reads the density token, so Comfortable/Compact (Round 14.8 F1/F3)
 * retightens every GlassCard live. Server-safe.
 */
export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`glass pad-density rounded-2xl border border-line ${className}`}>
      {children}
    </div>
  );
}
