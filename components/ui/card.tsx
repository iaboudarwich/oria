import type { ReactNode, HTMLAttributes } from "react";

type CardVariant = "flat" | "raised" | "floating";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  hoverable?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<CardVariant, string> = {
  flat:     "border border-line bg-surface-raised",
  raised:   "bg-surface-raised shadow-sm",
  floating: "bg-surface-floating border border-line shadow-md",
};

/**
 * Card with three depth variants. `hoverable` adds lift animation.
 */
export function Card({
  variant = "raised",
  hoverable,
  children,
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={[
        "rounded-2xl",
        VARIANT_CLASSES[variant],
        hoverable ? "hover-lift cursor-pointer" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
