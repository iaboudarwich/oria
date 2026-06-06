import type { ElementType, ReactNode } from "react";

/**
 * Layout primitives (Round: design infra). The ONLY way to set spacing on these
 * is a token step on the 4/8pt scale, never a hand-typed gap/padding. Each step
 * is the Tailwind spacing unit (step * 4px): 1=4, 2=8, 3=12, 4=16, 5=20, 6=24,
 * 8=32, 10=40, 12=48. The class maps are literal so Tailwind keeps them; passing
 * an off-scale value is a type error. See docs/design/heuristics.md.
 *
 * - Stack:   vertical rhythm (flex column + gap)
 * - Cluster: horizontal group that wraps (flex row + gap)
 * - Grid:    responsive columns with a gap
 * - Inset:   padding box
 */

export type Space = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;

const GAP: Record<Space, string> = {
  0: "gap-0",
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
  8: "gap-8",
  10: "gap-10",
  12: "gap-12",
};
const PAD: Record<Space, string> = {
  0: "p-0",
  1: "p-1",
  2: "p-2",
  3: "p-3",
  4: "p-4",
  5: "p-5",
  6: "p-6",
  8: "p-8",
  10: "p-10",
  12: "p-12",
};
const PADX: Record<Space, string> = {
  0: "px-0",
  1: "px-1",
  2: "px-2",
  3: "px-3",
  4: "px-4",
  5: "px-5",
  6: "px-6",
  8: "px-8",
  10: "px-10",
  12: "px-12",
};
const PADY: Record<Space, string> = {
  0: "py-0",
  1: "py-1",
  2: "py-2",
  3: "py-3",
  4: "py-4",
  5: "py-5",
  6: "py-6",
  8: "py-8",
  10: "py-10",
  12: "py-12",
};
const ALIGN: Record<"start" | "center" | "end" | "stretch", string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};
const JUSTIFY: Record<"start" | "center" | "end" | "between", string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};
const COLS: Record<2 | 3 | 4, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type Common = { as?: ElementType; className?: string; children?: ReactNode };

/** Vertical rhythm: a flex column whose only spacing input is the gap token. */
export function Stack({
  gap = 4,
  align,
  as: Tag = "div",
  className,
  children,
}: Common & { gap?: Space; align?: keyof typeof ALIGN }) {
  return (
    <Tag className={cx("flex flex-col", GAP[gap], align && ALIGN[align], className)}>
      {children}
    </Tag>
  );
}

/** Horizontal group that wraps; gap is a token. Centers items by default. */
export function Cluster({
  gap = 2,
  align = "center",
  justify,
  as: Tag = "div",
  className,
  children,
}: Common & { gap?: Space; align?: keyof typeof ALIGN; justify?: keyof typeof JUSTIFY }) {
  return (
    <Tag
      className={cx(
        "flex flex-wrap",
        GAP[gap],
        ALIGN[align],
        justify && JUSTIFY[justify],
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Responsive grid: 2/3/4 columns (one per row on phones) with a gap token. */
export function Grid({
  gap = 3,
  cols = 2,
  as: Tag = "div",
  className,
  children,
}: Common & { gap?: Space; cols?: keyof typeof COLS }) {
  return <Tag className={cx("grid", GAP[gap], COLS[cols], className)}>{children}</Tag>;
}

/** Padding box: a single `pad`, or split `x`/`y`, all token steps. */
export function Inset({
  pad,
  x,
  y,
  as: Tag = "div",
  className,
  children,
}: Common & { pad?: Space; x?: Space; y?: Space }) {
  return (
    <Tag
      className={cx(pad != null && PAD[pad], x != null && PADX[x], y != null && PADY[y], className)}
    >
      {children}
    </Tag>
  );
}
