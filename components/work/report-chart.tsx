import type { ReportChart } from "@/lib/data/workspace-reports";

const PALETTE = ["#1c1a17", "#7a5a2a", "#3f5240", "#7a4a7a", "#3a6a8a"];

/**
 * Minimal inline-SVG chart. Two kinds only — bar (categorical, one or
 * more series) and line (time series). No tooltips, no animation, no
 * library: paints fast, fits the calm aesthetic, never wraps the page.
 */
export function ReportChartView({ chart }: { chart: ReportChart }) {
  if (chart.series.length === 0) return null;
  return chart.kind === "bar" ? <BarChart chart={chart} /> : <LineChart chart={chart} />;
}

function BarChart({ chart }: { chart: ReportChart }) {
  const xValues = Array.from(
    new Set(chart.series.flatMap((s) => s.data.map((d) => d.x))),
  );
  if (xValues.length === 0) return null;

  const max = Math.max(
    1,
    ...chart.series.flatMap((s) => s.data.map((d) => d.y)),
  );

  const W = 600;
  const H = 200;
  const padTop = 12;
  const padBottom = 36;
  const padLeft = 36;
  const padRight = 12;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const groupCount = xValues.length;
  const groupWidth = plotW / groupCount;
  const seriesCount = chart.series.length;
  const barWidth = Math.max(2, (groupWidth - 8) / seriesCount);

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={chart.caption ?? "Chart"}
      >
        {/* Y axis baseline */}
        <line
          x1={padLeft}
          x2={W - padRight}
          y1={H - padBottom}
          y2={H - padBottom}
          stroke="#e8e3d8"
          strokeWidth={1}
        />
        {xValues.map((x, i) => {
          const groupX = padLeft + i * groupWidth + 4;
          return (
            <g key={x}>
              {chart.series.map((s, si) => {
                const point = s.data.find((d) => d.x === x);
                const y = point?.y ?? 0;
                const h = (y / max) * plotH;
                const bx = groupX + si * barWidth;
                const by = H - padBottom - h;
                return (
                  <rect
                    key={s.label + si}
                    x={bx}
                    y={by}
                    width={Math.max(2, barWidth - 2)}
                    height={Math.max(0, h)}
                    fill={PALETTE[si % PALETTE.length]}
                    rx={2}
                  />
                );
              })}
              <text
                x={groupX + (groupWidth - 8) / 2}
                y={H - padBottom + 14}
                textAnchor="middle"
                fontSize={10}
                fill="#73685a"
              >
                {x}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend series={chart.series} caption={chart.caption} />
    </figure>
  );
}

function LineChart({ chart }: { chart: ReportChart }) {
  const xValues = Array.from(
    new Set(chart.series.flatMap((s) => s.data.map((d) => d.x))),
  );
  if (xValues.length === 0) return null;

  const max = Math.max(
    1,
    ...chart.series.flatMap((s) => s.data.map((d) => d.y)),
  );

  const W = 600;
  const H = 200;
  const padTop = 12;
  const padBottom = 36;
  const padLeft = 36;
  const padRight = 12;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  const xStep = xValues.length > 1 ? plotW / (xValues.length - 1) : 0;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-label={chart.caption ?? "Chart"}
      >
        <line
          x1={padLeft}
          x2={W - padRight}
          y1={H - padBottom}
          y2={H - padBottom}
          stroke="#e8e3d8"
          strokeWidth={1}
        />
        {chart.series.map((s, si) => {
          const color = PALETTE[si % PALETTE.length];
          const points = xValues
            .map((x, i) => {
              const point = s.data.find((d) => d.x === x);
              if (!point) return null;
              const px = padLeft + i * xStep;
              const py = H - padBottom - (point.y / max) * plotH;
              return `${px},${py}`;
            })
            .filter((p): p is string => !!p)
            .join(" ");
          return (
            <g key={s.label + si}>
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {xValues.map((x, i) => {
                const point = s.data.find((d) => d.x === x);
                if (!point) return null;
                const px = padLeft + i * xStep;
                const py = H - padBottom - (point.y / max) * plotH;
                return (
                  <circle key={x + i} cx={px} cy={py} r={2.5} fill={color} />
                );
              })}
            </g>
          );
        })}
        {xValues.map((x, i) => (
          <text
            key={x + i}
            x={padLeft + i * xStep}
            y={H - padBottom + 14}
            textAnchor="middle"
            fontSize={10}
            fill="#73685a"
          >
            {x}
          </text>
        ))}
      </svg>
      <Legend series={chart.series} caption={chart.caption} />
    </figure>
  );
}

function Legend({
  series,
  caption,
}: {
  series: ReportChart["series"];
  caption?: string;
}) {
  return (
    <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
      {series.map((s, i) => (
        <span
          key={s.label + i}
          className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted"
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
          />
          {s.label}
        </span>
      ))}
      {caption ? (
        <span className="text-[11px] text-ink-faint">{caption}</span>
      ) : null}
    </figcaption>
  );
}
