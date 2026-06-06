import type { ChartPoint } from "@/lib/daily/context-surface";

/**
 * The one reusable chart wrapper for the per-context surface. Hand-rolled
 * inline SVG (no chart library), bar or line, brand-tinted, calm. Every
 * archetype's chart renders through this; only the data and kind change.
 */
export function ContextChart({
  kind,
  points,
  caption,
}: {
  kind: "bar" | "line";
  points: ChartPoint[];
  caption?: string;
}) {
  if (!points.length) return null;
  const W = 320;
  const H = 72; // bar/line area only; axis labels render as HTML below
  const PAD = 6;
  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = (W - PAD * 2) / points.length;
  // Match the label row's edge inset to the chart's PAD so each label sits under
  // its bar's center (bar center = PAD + (i + 0.5) * stepX).
  const edgeInset = `${(PAD / W) * 100}%`;

  return (
    <figure className="space-y-1.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-16 w-full"
        role="img"
        aria-label={caption ?? "chart"}
        preserveAspectRatio="none"
      >
        {kind === "bar"
          ? points.map((p, i) => {
              const h = Math.round((p.value / max) * (H - 6));
              const x = PAD + i * stepX + stepX * 0.18;
              const w = stepX * 0.64;
              const y = H - h;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={w}
                  height={Math.max(1, h)}
                  rx={2}
                  style={{ fill: "var(--brand)", opacity: 0.85 }}
                />
              );
            })
          : (() => {
              const pts = points.map((p, i) => {
                const x = PAD + i * stepX + stepX / 2;
                const y = H - Math.round((p.value / max) * (H - 6));
                return `${x},${y}`;
              });
              return (
                <>
                  <polyline
                    points={pts.join(" ")}
                    fill="none"
                    style={{ stroke: "var(--brand)" }}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {points.map((p, i) => {
                    const [x, y] = pts[i].split(",");
                    return (
                      <circle key={i} cx={x} cy={y} r={2.5} style={{ fill: "var(--brand)" }} />
                    );
                  })}
                </>
              );
            })()}
      </svg>
      {/* Axis labels: real UI text (Inter), not stretched SVG <text>. Each label
       *  sits in an equal column under its bar. AA-contrast muted ink. */}
      <div
        aria-hidden
        className="flex"
        style={{ paddingInlineStart: edgeInset, paddingInlineEnd: edgeInset }}
      >
        {points.map((p, i) => (
          <span
            key={i}
            className="min-w-0 flex-1 truncate px-0.5 text-center text-[10px] font-medium tracking-normal text-ink-muted"
          >
            {p.label}
          </span>
        ))}
      </div>
      {caption ? (
        <figcaption className="px-1 text-[11.5px] text-ink-faint">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
