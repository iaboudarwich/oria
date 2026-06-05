"use client";

import { useState } from "react";
import type { Artifact } from "@/lib/ai/artifact";

/**
 * Inline renderer for an Ask answer's live artifact. One of: stat card, a small
 * bar/line chart, a table, or an interactive checklist. Calm, token-backed,
 * hand-rolled SVG (no chart library), and RTL-safe (logical properties).
 */
export function MessageArtifact({ artifact }: { artifact: Artifact }) {
  switch (artifact.type) {
    case "stat_card":
      return <StatCard a={artifact} />;
    case "chart":
      return <ChartCard a={artifact} />;
    case "table":
      return <TableCard a={artifact} />;
    case "checklist":
      return <ChecklistCard a={artifact} />;
    default:
      return null;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-2xl border border-line bg-surface-raised p-4">{children}</div>
  );
}

function StatCard({ a }: { a: Extract<Artifact, { type: "stat_card" }> }) {
  return (
    <Shell>
      <p className="text-eyebrow">{a.label}</p>
      <p className="mt-1 text-[28px] font-semibold leading-none tracking-tight text-ink tabular-nums">
        {a.value}
      </p>
      {a.sublabel ? <p className="mt-1.5 text-[12.5px] text-ink-muted">{a.sublabel}</p> : null}
    </Shell>
  );
}

function ChartCard({ a }: { a: Extract<Artifact, { type: "chart" }> }) {
  const W = 520;
  const H = 120;
  const PAD = 8;
  const max = Math.max(1, ...a.points.map((p) => p.value));
  const min = Math.min(0, ...a.points.map((p) => p.value));
  const span = max - min || 1;
  const stepX = (W - PAD * 2) / a.points.length;
  const y = (v: number) => PAD + (H - PAD * 2) - ((v - min) / span) * (H - PAD * 2);

  return (
    <Shell>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-28 w-full"
        role="img"
        aria-label={a.caption ?? "chart"}
        preserveAspectRatio="none"
      >
        {a.chartKind === "bar"
          ? a.points.map((p, i) => {
              const h = ((p.value - min) / span) * (H - PAD * 2);
              const x = PAD + i * stepX + stepX * 0.18;
              return (
                <rect
                  key={i}
                  x={x}
                  y={H - PAD - h}
                  width={stepX * 0.64}
                  height={Math.max(1, h)}
                  rx={2}
                  style={{ fill: "var(--brand)", opacity: 0.85 }}
                />
              );
            })
          : (
              <polyline
                points={a.points
                  .map((p, i) => `${PAD + i * stepX + stepX / 2},${y(p.value)}`)
                  .join(" ")}
                fill="none"
                style={{ stroke: "var(--brand)" }}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
      </svg>
      <div aria-hidden className="mt-1 flex" style={{ paddingInline: `${(PAD / W) * 100}%` }}>
        {a.points.map((p, i) => (
          <span
            key={i}
            className="min-w-0 flex-1 truncate px-0.5 text-center text-[10px] font-medium text-ink-muted tabular-nums"
          >
            {p.label}
          </span>
        ))}
      </div>
      {a.caption ? <p className="mt-1 px-1 text-[11.5px] text-ink-faint">{a.caption}</p> : null}
    </Shell>
  );
}

function TableCard({ a }: { a: Extract<Artifact, { type: "table" }> }) {
  return (
    <Shell>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {a.columns.map((c, i) => (
                <th key={i} className="px-2 py-1.5 text-start text-eyebrow text-ink-muted">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.rows.map((r, ri) => (
              <tr key={ri} className="border-b border-line/60 last:border-0">
                {r.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1.5 text-ink-soft tabular-nums">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a.caption ? <p className="mt-2 px-1 text-[11.5px] text-ink-faint">{a.caption}</p> : null}
    </Shell>
  );
}

function ChecklistCard({ a }: { a: Extract<Artifact, { type: "checklist" }> }) {
  const [checked, setChecked] = useState<Set<number>>(
    () => new Set(a.items.map((it, i) => (it.done ? i : -1)).filter((i) => i >= 0)),
  );
  return (
    <Shell>
      {a.title ? <p className="mb-2 text-eyebrow">{a.title}</p> : null}
      <ul className="space-y-1.5">
        {a.items.map((it, i) => {
          const on = checked.has(i);
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() =>
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
                className="flex w-full items-center gap-2.5 text-start"
                aria-pressed={on}
              >
                <span
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border text-[10px] ${
                    on
                      ? "border-brand bg-brand text-surface"
                      : "border-line-strong text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className={`text-[13.5px] ${on ? "text-ink-faint line-through" : "text-ink-soft"}`}>
                  {it.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Shell>
  );
}
