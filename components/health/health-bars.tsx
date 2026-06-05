/**
 * A calm 7-day bar strip for the Health panels (recovery, strain, sleep).
 * Mirrors the Diet weekly chart: today is inked, days with data use sand, empty
 * days a faint baseline. Server-safe, no client JS. Values are pre-normalized
 * by the caller into 0..max.
 */
export type HealthBar = { label: string; value: number };

export function HealthBars({
  bars,
  caption,
}: {
  bars: HealthBar[];
  caption?: string;
}) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="rounded-2xl border border-line bg-surface-raised p-4">
      <ul className="flex h-[100px] items-end gap-2">
        {bars.map((d, i) => {
          const h = d.value <= 0 ? 4 : Math.max(8, Math.round((d.value / max) * 100));
          const isLast = i === bars.length - 1;
          return (
            <li key={d.label + i} className="flex flex-1 flex-col items-center gap-1.5">
              <span
                style={{ height: `${h}%` }}
                className={`w-full rounded-md ${
                  isLast ? "bg-ink" : d.value > 0 ? "bg-sand" : "bg-line"
                }`}
                title={String(d.value)}
              />
              <span className={`text-[10.5px] ${isLast ? "text-ink" : "text-ink-faint"}`}>
                {d.label}
              </span>
            </li>
          );
        })}
      </ul>
      {caption ? <p className="mt-2 px-1 text-[11.5px] text-ink-faint">{caption}</p> : null}
    </div>
  );
}
