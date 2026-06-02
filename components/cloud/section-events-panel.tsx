import { getTranslations } from "next-intl/server";
import type { UpcomingEvent } from "@/lib/google/calendar";

/**
 * Read-only list of calendar events filed into a section. Data is fetched by
 * the page (parallel to its entry fetch). Renders nothing when empty.
 */
export async function SectionEventsPanel({ events }: { events: UpcomingEvent[] }) {
  if (events.length === 0) return null;
  const t = await getTranslations("cloud");
  return (
    <section className="rounded-2xl border border-line bg-surface-raised p-4">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.05em] text-ink-faint">
        {t("events_heading")}
      </h2>
      <ul className="space-y-0.5">
        {events.map((e) => {
          const when = e.isAllDay
            ? new Date(e.startsAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            : new Date(e.startsAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              });
          const row = (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="shrink-0 text-ink-faint">🗓</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{e.title}</p>
                <p className="truncate text-[11px] text-ink-faint">
                  {[when, e.location].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
          );
          return (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-base hover:bg-canvas"
            >
              {e.webViewLink ? (
                <a
                  href={e.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1"
                >
                  {row}
                </a>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
