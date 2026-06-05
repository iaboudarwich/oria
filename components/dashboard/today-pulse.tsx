import Link from "next/link";
import {
  CalendarIcon,
  ClockIcon,
  GiftIcon,
  HeartIcon,
  PersonIcon,
  PlaneIcon,
  WalletIcon,
} from "@/components/ui/icon";
import { loadCalendar } from "@/lib/data/calendar";
import { countReviewUploads } from "@/lib/data/sections";
import type { CalendarCategory, CalendarEntry } from "@/lib/data/calendar-types";

/** Today's agenda only ever shows real schedule entries (reminders you set and
 *  events from a connected calendar), both real instants. */
function entryDate(e: CalendarEntry): Date {
  return new Date(e.due_at);
}

const CATEGORY_ICON: Record<
  CalendarCategory,
  React.ComponentType<{ size?: number }>
> = {
  reminders: CalendarIcon,
  finance: WalletIcon,
  travel: PlaneIcon,
  events: GiftIcon,
  health: HeartIcon,
  personal: PersonIcon,
};

const CATEGORY_TINT: Record<CalendarCategory, string> = {
  reminders: "text-ink-muted",
  finance: "text-[#7a5a2a]",
  travel: "text-[#3a6a8a]",
  events: "text-[#7a4a7a]",
  health: "text-[#5a7a5a]",
  personal: "text-ink-soft",
};

/**
 * The "today" pulse on the dashboard home. Shows up to 5 calendar items due
 * today (or already overdue) and the review nudge if present. Replaces what
 * used to be a static dashboard with the upload box at the center.
 *
 * Empty state stays calm: "Calm day, nothing scheduled.". never an alarm.
 */
export async function TodayPulse({ activeSpaceId }: { activeSpaceId: string }) {
  const [{ entries }, reviewCount] = await Promise.all([
    loadCalendar(),
    countReviewUploads(),
  ]);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  // The day's agenda is real schedule only: reminders you set + events from a
  // connected calendar. Extracted document dates ("item" entries, e.g. a photo
  // or receipt that merely carries a timestamp) never enter the agenda; they
  // live on the full Calendar. "Today" = open entries due before end-of-today
  // (so overdue ones show too).
  const todayItems = entries
    .filter((e) => e.kind === "reminder" || e.kind === "event")
    .filter((e) => !e.done)
    .filter((e) => {
      if (!e.due_at) return false;
      return entryDate(e) < endOfDay;
    })
    .slice(0, 5);

  const hasReview = reviewCount > 0;
  const hasItems = todayItems.length > 0;

  if (!hasReview && !hasItems) {
    return (
      <section>
        <SectionLabel
          label="Today"
          rightHref="/dashboard/calendar"
          rightLabel="Open calendar"
        />
        <p className="px-1 text-[13px] text-ink-faint">
          Calm day. Nothing on the calendar yet.
        </p>
      </section>
    );
  }

  return (
    <section>
      <SectionLabel
        label="Today"
        rightHref="/dashboard/calendar"
        rightLabel="Open calendar"
      />
      <ul className="space-y-0.5">
        {hasReview ? <ReviewRow count={reviewCount} /> : null}
        {todayItems.map((e) => (
          <CalendarRow key={e.id} entry={e} activeSpaceId={activeSpaceId} />
        ))}
      </ul>
    </section>
  );
}

function SectionLabel({
  label,
  rightHref,
  rightLabel,
}: {
  label: string;
  rightHref: string;
  rightLabel: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between px-1">
      <h2 className="text-[13px] font-medium text-ink-muted">{label}</h2>
      <Link
        href={rightHref}
        className="text-[12px] text-ink-faint hover:text-ink transition-base"
      >
        {rightLabel}
      </Link>
    </div>
  );
}

function CalendarRow({
  entry: e,
  activeSpaceId,
}: {
  entry: CalendarEntry;
  activeSpaceId: string;
}) {
  const Icon = CATEGORY_ICON[e.category];
  const href = e.upload_id ? `/dashboard/uploads/${e.upload_id}` : "/dashboard/calendar";
  const isOtherSpace = e.space_id !== activeSpaceId;

  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-base hover:bg-surface-raised"
      >
        <span
          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center ${CATEGORY_TINT[e.category]}`}
        >
          <Icon size={13} />
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] text-ink">
          {e.title}
        </p>
        {isOtherSpace ? (
          <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-[10.5px] text-ink-muted">
            {e.space_name}
          </span>
        ) : null}
        {e.due_at ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-faint">
            <ClockIcon size={11} />
            {formatTime(e)}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function ReviewRow({ count }: { count: number }) {
  return (
    <li>
      <Link
        href="/dashboard/sections/review"
        className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-base hover:bg-surface-raised"
      >
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-ink-muted">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 10h18" />
          </svg>
        </span>
        <p className="min-w-0 flex-1 text-[13px] text-ink">
          {count} {count === 1 ? "item" : "items"} unsorted
        </p>
        <span className="text-[11.5px] text-ink-faint">Sort</span>
      </Link>
    </li>
  );
}

function formatTime(e: CalendarEntry): string {
  const d = entryDate(e);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const isAllDay =
    d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
  if (isAllDay) return "All day";
  if (isToday) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  // Overdue items show day + time
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
