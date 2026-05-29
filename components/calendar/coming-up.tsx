import type { CalendarEntry } from "@/lib/data/calendar-types";
import type { ComingUpBucket } from "@/lib/data/calendar";

/**
 * "Coming up" rollup that sits above the calendar list. Pure renderer.
 * the time math (Date.now etc.) lives in groupComingUp on the server
 * side, called by the page. Keeps this component purity-rule clean.
 *
 * Shows the buckets the user actually scans for at a glance: overdue,
 * this week, renewals in 30d, upcoming travel, recurring bills.
 * Counts + the next item's title + due date per bucket. Empty when
 * nothing's coming up; the page hides the whole section in that case.
 */
export function ComingUpRollup({ buckets }: { buckets: ComingUpBucket[] }) {
  if (buckets.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 px-1 text-eyebrow">
        Coming up
      </h2>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2 md:grid-cols-4 lg:grid-cols-5">
        {buckets.map((b) => (
          <li
            key={b.key}
            className={`rounded-2xl border bg-surface-raised p-2.5 sm:p-3 ${
              b.tone === "alert" ? "border-claret/30" : "border-line"
            }`}
          >
            <p
              className={`text-[10.5px] uppercase tracking-[0.1em] ${
                b.tone === "alert" ? "text-claret" : "text-ink-faint"
              }`}
            >
              {b.label}
            </p>
            <p
              className={`mt-1 text-[20px] font-semibold tracking-tight ${
                b.tone === "alert" ? "text-claret" : "text-ink"
              }`}
            >
              {b.count}
            </p>
            {b.next ? (
              <p className="mt-1 truncate text-[11.5px] text-ink-faint">
                {nextLabel(b.next)} · {friendlyDate(b.next.due_at)}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function nextLabel(e: CalendarEntry): string {
  return e.title.length > 32 ? e.title.slice(0, 32).trim() + "…" : e.title;
}

function friendlyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
