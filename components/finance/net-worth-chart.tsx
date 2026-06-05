/**
 * Net worth line over time. Hand-rolled inline SVG (no chart library) sized for
 * a full-width card, brand-tinted, with a soft area fill under the line. Date
 * labels render as real HTML below the plot (Inter), not stretched SVG text.
 * One snapshot per day feeds this; a single point renders as a calm dot.
 */
export type NetWorthPoint = { date: string; value: number; label: string };

export function NetWorthChart({
  points,
  caption,
}: {
  points: NetWorthPoint[];
  caption?: string;
}) {
  if (!points.length) return null;

  const W = 640;
  const H = 160;
  const PAD = 8;
  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const plotH = H - PAD * 2;

  const x = (i: number) =>
    points.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (points.length - 1);
  const y = (v: number) => PAD + plotH - ((v - min) / span) * plotH;

  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;

  // Show at most ~6 evenly spaced date labels so they never crowd.
  const step = Math.max(1, Math.ceil(points.length / 6));

  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full"
        role="img"
        aria-label={caption ?? "Net worth over time"}
        preserveAspectRatio="none"
      >
        <polygon points={area} style={{ fill: "var(--brand)", opacity: 0.08 }} />
        {points.length === 1 ? (
          <circle cx={x(0)} cy={y(points[0].value)} r={4} style={{ fill: "var(--brand)" }} />
        ) : (
          <polyline
            points={line}
            fill="none"
            style={{ stroke: "var(--brand)" }}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
      </svg>
      <div aria-hidden className="flex justify-between px-1">
        {points.map((p, i) =>
          i % step === 0 || i === points.length - 1 ? (
            <span key={i} className="text-[10px] font-medium text-ink-muted tabular-nums">
              {p.label}
            </span>
          ) : null,
        )}
      </div>
      {caption ? (
        <figcaption className="px-1 text-[11.5px] text-ink-faint">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
