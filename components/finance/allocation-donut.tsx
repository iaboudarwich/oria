import type { AllocationSlice, ManualAssetKind } from "@/lib/net-worth/compute";

/**
 * Allocation donut: one ring, one arc per asset kind, sized by share. Hand
 * rolled inline SVG (no chart library), brand-led palette, calm. The center
 * carries the net worth figure. Accessible: role="img" with a spoken summary.
 */

// Kind -> a token-backed tint. Brand leads; the rest are the warm semantic
// ramp so the ring reads as one family, never a rainbow.
const KIND_COLOR: Record<ManualAssetKind, string> = {
  cash: "var(--brand)",
  investment: "var(--accent)",
  crypto: "var(--sage)",
  property: "var(--info)",
  vehicle: "var(--warning)",
  other: "var(--ink-muted)",
  debt: "var(--claret)",
};

export const KIND_LABEL: Record<ManualAssetKind, string> = {
  cash: "Cash",
  investment: "Investments",
  crypto: "Crypto",
  property: "Property",
  vehicle: "Vehicles",
  other: "Other",
  debt: "Debt",
};

export function colorForKind(kind: ManualAssetKind): string {
  return KIND_COLOR[kind] ?? "var(--ink-muted)";
}

export function AllocationDonut({
  slices,
  centerValue,
  centerLabel,
  ariaLabel,
}: {
  slices: AllocationSlice[];
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
}) {
  const size = 168;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  // Walk the slices into arc segments via stroke-dasharray offsets. The running
  // offset is derived from the prefix sum of prior shares (no render mutation).
  const segments = slices.map((s, i) => {
    const priorShare = slices.slice(0, i).reduce((sum, p) => sum + p.share, 0);
    const len = s.share * circumference;
    return {
      color: colorForKind(s.kind),
      dash: len,
      gap: circumference - len,
      offset: priorShare * circumference,
    };
  });

  return (
    <figure className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-6">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-[168px] w-[168px] shrink-0 -rotate-90"
        role="img"
        aria-label={ariaLabel}
      >
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          style={{ stroke: "var(--line)" }}
          strokeWidth={stroke}
        />
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            style={{ stroke: seg.color }}
            strokeWidth={stroke}
            strokeDasharray={`${seg.dash} ${seg.gap}`}
            strokeDashoffset={-seg.offset}
            strokeLinecap="butt"
          />
        ))}
        {/* Center figure (counter-rotate so it sits upright). */}
        <g transform={`rotate(90 ${cx} ${cy})`}>
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            className="fill-ink text-[19px] font-semibold"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {centerValue}
          </text>
          <text
            x={cx}
            y={cy + 16}
            textAnchor="middle"
            className="fill-ink-faint text-[10px] uppercase"
            style={{ letterSpacing: "0.06em" }}
          >
            {centerLabel}
          </text>
        </g>
      </svg>

      <ul className="w-full space-y-1.5">
        {slices.map((s) => (
          <li key={s.kind} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: colorForKind(s.kind) }}
            />
            <span className="flex-1 truncate text-ink-soft">{KIND_LABEL[s.kind]}</span>
            <span className="text-ink-faint tabular-nums">{Math.round(s.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
