import type { ReactNode } from "react";

/**
 * Eyebrow: the tiny uppercase letterspaced label above a section (heuristics
 * §1.4). Sets context and replaces a redundant heading. Server-safe.
 */
export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`text-eyebrow ${className}`}>{children}</p>;
}
