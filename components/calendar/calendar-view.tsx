"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/ui/icon";
import {
  CALENDAR_CATEGORY_LABEL,
  CALENDAR_TOPIC_LABEL,
  type CalendarCategory,
  type CalendarEntry,
  type CalendarSpace,
  type CalendarTopic,
} from "@/lib/data/calendar-types";
import {
  CalendarRow,
  addDays,
  bucketByDay,
  dayKey,
  formatDayLabel,
  isSameDay,
  startOfMonth,
  startOfWeek,
} from "./calendar-shared";
import { MonthGrid, YearGrid } from "./calendar-grid";

type Props = {
  entries: CalendarEntry[];
  spaces: CalendarSpace[];
  activeSpaceId: string;
};

type SpaceFilter = "all" | string;
type CategoryFilter = "all" | CalendarCategory;
type KindFilter = "all" | "event" | "reminder";
type TopicFilter = "all" | CalendarTopic;

type Mode = "list" | "year" | "month" | "week" | "day";

const CATEGORY_ORDER: CalendarCategory[] = [
  "reminders",
  "finance",
  "travel",
  "events",
  "health",
  "personal",
];

// Order in the filter row reflects what people scan for most often.
// Overdue first (because it's actionable), then payment-shaped buckets,
// then travel, then long-tail.
const TOPIC_ORDER: CalendarTopic[] = [
  "overdue",
  "payment",
  "invoice",
  "renewal",
  "recurring",
  "lease",
  "contract",
  "insurance",
  "flight",
  "travel",
  "reminder",
  "event",
];

export function CalendarView({ entries, spaces, activeSpaceId }: Props) {
  const [spaceFilter, setSpaceFilter] = useState<SpaceFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [topicFilter, setTopicFilter] = useState<TopicFilter>("all");
  const [mode, setMode] = useState<Mode>("list");
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Topic counts drive the chip row — chips with zero matches in the
  // current dataset still render so the user can see the full taxonomy,
  // but disabled so they can't get into an empty-state state by accident.
  const topicCounts = useMemo(() => {
    const counts = new Map<CalendarTopic, number>();
    for (const e of entries) counts.set(e.topic, (counts.get(e.topic) ?? 0) + 1);
    return counts;
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (spaceFilter !== "all" && e.space_id !== spaceFilter) return false;
      if (categoryFilter !== "all" && e.category !== categoryFilter) {
        return false;
      }
      if (kindFilter === "event" && e.kind !== "item") return false;
      if (kindFilter === "reminder" && e.kind !== "reminder") return false;
      if (topicFilter !== "all" && e.topic !== topicFilter) return false;
      return true;
    });
  }, [entries, spaceFilter, categoryFilter, kindFilter, topicFilter]);

  const showSpacePill = spaceFilter === "all";

  return (
    <div className="space-y-5">
      {/* Filters */}
      {spaces.length > 0 || entries.length > 0 ? (
        <div className="flex flex-col gap-2">
          {spaces.length > 1 ? (
            <PillRow>
              <Pill
                label="All spaces"
                active={spaceFilter === "all"}
                onClick={() => setSpaceFilter("all")}
              />
              {spaces.map((s) => (
                <Pill
                  key={s.id}
                  label={s.name}
                  active={spaceFilter === s.id}
                  onClick={() => setSpaceFilter(s.id)}
                />
              ))}
            </PillRow>
          ) : null}
          <PillRow muted>
            <Pill
              label="Everything"
              active={kindFilter === "all"}
              onClick={() => setKindFilter("all")}
            />
            <Pill
              label="Events"
              active={kindFilter === "event"}
              onClick={() => setKindFilter("event")}
            />
            <Pill
              label="Reminders"
              active={kindFilter === "reminder"}
              onClick={() => setKindFilter("reminder")}
            />
          </PillRow>
          <PillRow muted>
            <Pill
              label="All categories"
              active={categoryFilter === "all"}
              onClick={() => setCategoryFilter("all")}
            />
            {CATEGORY_ORDER.map((c) => (
              <Pill
                key={c}
                label={CALENDAR_CATEGORY_LABEL[c]}
                active={categoryFilter === c}
                onClick={() => setCategoryFilter(c)}
              />
            ))}
          </PillRow>
          <PillRow muted>
            <Pill
              label="Any topic"
              active={topicFilter === "all"}
              onClick={() => setTopicFilter("all")}
            />
            {TOPIC_ORDER.filter((t) => (topicCounts.get(t) ?? 0) > 0).map(
              (t) => (
                <Pill
                  key={t}
                  label={`${CALENDAR_TOPIC_LABEL[t]} · ${topicCounts.get(t) ?? 0}`}
                  active={topicFilter === t}
                  onClick={() => setTopicFilter(t)}
                />
              ),
            )}
          </PillRow>
        </div>
      ) : null}

      {/* Mode bar */}
      <ModeBar
        mode={mode}
        setMode={setMode}
        cursor={cursor}
        setCursor={setCursor}
      />

      {/* Active view */}
      {mode === "list" ? (
        <ListView entries={filtered} showSpacePill={showSpacePill} activeSpaceId={activeSpaceId} />
      ) : mode === "year" ? (
        <YearGrid
          cursor={cursor}
          entries={filtered}
          onPickMonth={(d) => {
            setCursor(d);
            setMode("month");
          }}
        />
      ) : mode === "month" ? (
        <MonthGrid
          cursor={cursor}
          entries={filtered}
          onPickDay={(d) => {
            setCursor(d);
            setMode("day");
          }}
        />
      ) : mode === "week" ? (
        <WeekView
          cursor={cursor}
          entries={filtered}
          showSpacePill={showSpacePill}
          activeSpaceId={activeSpaceId}
        />
      ) : (
        <DayView
          cursor={cursor}
          entries={filtered}
          showSpacePill={showSpacePill}
          activeSpaceId={activeSpaceId}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode bar
// ---------------------------------------------------------------------------

function ModeBar({
  mode,
  setMode,
  cursor,
  setCursor,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  cursor: Date;
  setCursor: (d: Date) => void;
}) {
  const isCalendar = mode !== "list";

  function stepCursor(delta: 1 | -1) {
    const d = new Date(cursor);
    if (mode === "year") d.setFullYear(d.getFullYear() + delta);
    else if (mode === "month") d.setMonth(d.getMonth() + delta);
    else if (mode === "week") d.setDate(d.getDate() + 7 * delta);
    else if (mode === "day") d.setDate(d.getDate() + delta);
    setCursor(d);
  }

  function goToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCursor(d);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segment>
        <SegmentButton active={mode === "list"} onClick={() => setMode("list")}>
          List
        </SegmentButton>
        <SegmentButton
          active={isCalendar}
          onClick={() => setMode(mode === "list" ? "month" : mode)}
        >
          Calendar
        </SegmentButton>
      </Segment>

      {isCalendar ? (
        <>
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => stepCursor(-1)}
              aria-label="Previous"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition-base hover:border-line-strong hover:text-ink"
            >
              <ChevronLeftIcon size={12} />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[12px] text-ink-soft transition-base hover:border-line-strong hover:text-ink"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => stepCursor(1)}
              aria-label="Next"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-soft transition-base hover:border-line-strong hover:text-ink"
            >
              <ChevronRightIcon size={12} />
            </button>
          </div>

          <p className="text-[13.5px] font-medium text-ink">
            {periodTitle(mode, cursor)}
          </p>

          <div className="ml-auto">
            <Segment>
              <SegmentButton active={mode === "year"} onClick={() => setMode("year")}>
                Year
              </SegmentButton>
              <SegmentButton active={mode === "month"} onClick={() => setMode("month")}>
                Month
              </SegmentButton>
              <SegmentButton active={mode === "week"} onClick={() => setMode("week")}>
                Week
              </SegmentButton>
              <SegmentButton active={mode === "day"} onClick={() => setMode("day")}>
                Day
              </SegmentButton>
            </Segment>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Segment({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {children}
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 items-center rounded-md px-3 text-[12px] transition-base ${
        active
          ? "bg-canvas text-ink"
          : "text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function periodTitle(mode: Mode, cursor: Date): string {
  if (mode === "year") return String(cursor.getFullYear());
  if (mode === "month") {
    return cursor.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }
  if (mode === "week") {
    const s = startOfWeek(cursor);
    const e = addDays(s, 6);
    const sameMonth = s.getMonth() === e.getMonth();
    if (sameMonth) {
      return `${s.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })} – ${e.getDate()}, ${e.getFullYear()}`;
    }
    return `${s.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })} – ${e.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })}`;
  }
  return formatDayLabel(cursor);
}

// ---------------------------------------------------------------------------
// Pills (filter rows)
// ---------------------------------------------------------------------------

function PillRow({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={`-mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-0.5 ${
        muted ? "opacity-90" : ""
      }`}
    >
      {children}
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 shrink-0 items-center rounded-full border px-3 text-[12px] transition-base ${
        active
          ? "border-ink bg-ink text-surface"
          : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function ListView({
  entries,
  showSpacePill,
  activeSpaceId,
}: {
  entries: CalendarEntry[];
  showSpacePill: boolean;
  activeSpaceId: string;
}) {
  const groups = useMemo(() => groupList(entries), [entries]);
  if (groups.length === 0) {
    return (
      <p className="px-1 text-[13px] text-ink-faint">
        Nothing on the calendar yet.
      </p>
    );
  }
  return (
    <div className="space-y-7">
      {groups.map((g) => (
        <section key={g.key}>
          <div className="mb-2 flex items-baseline gap-2 px-1">
            <h2 className="text-[13px] font-medium text-ink">{g.label}</h2>
            {g.hint ? (
              <span className="text-[11.5px] text-ink-faint">{g.hint}</span>
            ) : null}
          </div>
          <ul className="space-y-0.5">
            {g.entries.map((e) => (
              <CalendarRow
                key={e.id}
                entry={e}
                showSpacePill={showSpacePill && e.space_id !== activeSpaceId}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function WeekView({
  cursor,
  entries,
  showSpacePill,
  activeSpaceId,
}: {
  cursor: Date;
  entries: CalendarEntry[];
  showSpacePill: boolean;
  activeSpaceId: string;
}) {
  const start = startOfWeek(cursor);
  const buckets = bucketByDay(entries);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-5">
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => {
        const items = buckets.get(dayKey(d)) ?? [];
        const isToday = isSameDay(d, today);
        return (
          <section key={dayKey(d)}>
            <div className="mb-2 flex items-baseline gap-2 px-1">
              <h2
                className={`text-[13px] font-medium ${
                  isToday ? "text-ink" : "text-ink-muted"
                }`}
              >
                {d.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </h2>
              {isToday ? (
                <span className="text-[11.5px] text-ink-faint">Today</span>
              ) : null}
            </div>
            {items.length === 0 ? (
              <p className="px-3 text-[12px] text-ink-faint">Nothing scheduled.</p>
            ) : (
              <ul className="space-y-0.5">
                {items.map((e) => (
                  <CalendarRow
                    key={e.id}
                    entry={e}
                    showSpacePill={showSpacePill && e.space_id !== activeSpaceId}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DayView({
  cursor,
  entries,
  showSpacePill,
  activeSpaceId,
}: {
  cursor: Date;
  entries: CalendarEntry[];
  showSpacePill: boolean;
  activeSpaceId: string;
}) {
  const buckets = bucketByDay(entries);
  const items = buckets.get(dayKey(cursor)) ?? [];

  if (items.length === 0) {
    return (
      <p className="px-1 text-[13px] text-ink-faint">
        Nothing scheduled for {formatDayLabel(cursor)}.
      </p>
    );
  }
  return (
    <ul className="space-y-0.5">
      {items.map((e) => (
        <CalendarRow
          key={e.id}
          entry={e}
          showSpacePill={showSpacePill && e.space_id !== activeSpaceId}
        />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// List grouping
// ---------------------------------------------------------------------------

type Group = {
  key: string;
  label: string;
  hint: string | null;
  entries: CalendarEntry[];
};

function groupList(entries: CalendarEntry[]): Group[] {
  // Every entry has a due_at (loadCalendar filters out the date-less ones);
  // the calendar is for things that happen on a date. Bucket by day.
  const buckets = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    const d = new Date(e.due_at);
    const k = dayKey(d);
    const arr = buckets.get(k);
    if (arr) arr.push(e);
    else buckets.set(k, [e]);
  }
  const today = dayKey(new Date());
  const tomorrow = dayKey(addDays(new Date(), 1));
  const sortedKeys = Array.from(buckets.keys()).sort();
  return sortedKeys.map((k) => {
    const date = new Date(k + "T00:00:00");
    let label: string;
    let hint: string | null = null;
    if (k === today) {
      label = "Today";
      hint = date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } else if (k === tomorrow) {
      label = "Tomorrow";
      hint = date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } else {
      label = date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });
    }
    return { key: k, label, hint, entries: buckets.get(k) ?? [] };
  });
}

// Re-export so legacy imports from this file don't break.
export { startOfMonth };
