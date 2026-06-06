import Link from "next/link";
import { loadCalendar } from "@/lib/data/calendar";
import { countReviewUploads } from "@/lib/data/sections";
import type { CalendarEntry } from "@/lib/data/calendar-types";
import { AgendaClient, type AgendaItem } from "./agenda-client";

/**
 * Today's agenda: real schedule only (reminders you set + events from a
 * connected calendar). It feeds the AgendaClient, which adds the Smart-List
 * saved views (Today / Overdue / This week / Flagged) and, on Today, the
 * Morning / Afternoon / Evening buckets with a current-time highlight. We pass
 * a wider window (overdue through the next 7 days, open only) so every view has
 * its items; the client filters. Extracted "item" entries never enter here.
 */
export async function TodayPulse({
  activeSpaceId,
  tz,
}: {
  activeSpaceId: string;
  tz: string | null;
}) {
  const [{ entries }, reviewCount] = await Promise.all([loadCalendar(), countReviewUploads()]);

  const horizonMs = new Date().getTime() + 7 * 24 * 60 * 60 * 1000;

  const items: AgendaItem[] = entries
    .filter((e) => (e.kind === "reminder" || e.kind === "event") && !e.done && e.due_at)
    .filter((e) => new Date(e.due_at).getTime() <= horizonMs)
    .slice(0, 50)
    .map((e: CalendarEntry) => ({
      id: e.id,
      reminderId: e.kind === "reminder" ? e.id.replace(/^reminder:/, "") : null,
      title: e.title,
      whenISO: e.due_at,
      done: e.done === true,
      flagged: e.flagged,
      href: e.upload_id ? `/dashboard/uploads/${e.upload_id}` : "/dashboard/calendar",
      spaceLabel: e.space_id !== activeSpaceId ? e.space_name : null,
    }));

  return (
    <div className="space-y-3">
      {reviewCount > 0 ? (
        <Link
          href="/dashboard/sections/review"
          className="transition-base flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-raised"
        >
          <p className="min-w-0 flex-1 text-[13px] text-ink">
            {reviewCount} unsorted in your inbox
          </p>
          <span className="text-[11.5px] text-ink-faint">Sort</span>
        </Link>
      ) : null}
      <AgendaClient items={items} tz={tz} nowISO={new Date().toISOString()} />
    </div>
  );
}
