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
  const H = 96;
  const PAD = 6;
  const max = Math.max(1, ...points.map((p) => p.value));
  const innerH = H - 18; // leave room for labels
  const stepX = (W - PAD * 2) / points.length;

  return (
    <figure className="space-y-1.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-24 w-full"
        role="img"
        aria-label={caption ?? "chart"}
        preserveAspectRatio="none"
      >
        {kind === "bar"
          ? points.map((p, i) => {
              const h = Math.round((p.value / max) * (innerH - 6));
              const x = PAD + i * stepX + stepX * 0.18;
              const w = stepX * 0.64;
              const y = innerH - h;
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
                const y = innerH - Math.round((p.value / max) * (innerH - 6));
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
                    return <circle key={i} cx={x} cy={y} r={2.5} style={{ fill: "var(--brand)" }} />;
                  })}
                </>
              );
            })()}
        {points.map((p, i) => (
          <text
            key={`l${i}`}
            x={PAD + i * stepX + stepX / 2}
            y={H - 4}
            textAnchor="middle"
            className="fill-ink-faint"
            style={{ fontSize: 8 }}
          >
            {p.label}
          </text>
        ))}
      </svg>
      {caption ? <figcaption className="px-1 text-[11.5px] text-ink-faint">{caption}</figcaption> : null}
    </figure>
  );
}
