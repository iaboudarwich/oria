"use client";

import Link from "next/link";
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  GiftIcon,
  HeartIcon,
  PersonIcon,
  PlaneIcon,
  SparkIcon,
  WalletIcon,
} from "@/components/ui/icon";
import {
  confirmReminder,
  deleteReminder,
  toggleReminderDone,
} from "@/lib/data/reminder-actions";
import type {
  CalendarCategory,
  CalendarEntry,
} from "@/lib/data/calendar-types";

export const CATEGORY_ICON: Record<
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

export const CATEGORY_TINT: Record<CalendarCategory, string> = {
  reminders: "text-ink-muted",
  finance: "text-[#7a5a2a]",
  travel: "text-[#3a6a8a]",
  events: "text-[#7a4a7a]",
  health: "text-[#5a7a5a]",
  personal: "text-ink-soft",
};

/** Dot color used for compact views (Month/Year grids). */
export const CATEGORY_DOT: Record<CalendarCategory, string> = {
  reminders: "bg-ink-muted/60",
  finance: "bg-[#7a5a2a]",
  travel: "bg-[#3a6a8a]",
  events: "bg-[#7a4a7a]",
  health: "bg-[#5a7a5a]",
  personal: "bg-ink-soft/70",
};

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // Sunday as week start, matching most US calendar UIs.
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  return x;
}

export function startOfMonth(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatDayLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const isAllDay =
    d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0;
  if (isAllDay) return "All day";
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Bucket entries by yyyy-mm-dd of due_at; items without due_at omitted. */
export function bucketByDay(
  entries: CalendarEntry[],
): Map<string, CalendarEntry[]> {
  const buckets = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    if (!e.due_at) continue;
    const k = dayKey(new Date(e.due_at));
    const arr = buckets.get(k);
    if (arr) arr.push(e);
    else buckets.set(k, [e]);
  }
  return buckets;
}

/** Row used by List + Week + Day views. */
export function CalendarRow({
  entry: e,
  showSpacePill,
  showTime = true,
}: {
  entry: CalendarEntry;
  showSpacePill: boolean;
  showTime?: boolean;
}) {
  const Icon = CATEGORY_ICON[e.category];
  const isReminder = e.kind === "reminder";
  const suggested = isReminder && e.source === "suggested" && !e.confirmed_at;
  // Strip our type prefix ("reminder:" / "item:") when submitting to the
  // server actions, which expect the raw row id.
  const rawId = e.id.includes(":") ? e.id.split(":", 2)[1] : e.id;

  return (
    <li
      className={`group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-base hover:bg-surface-raised ${
        e.done ? "opacity-60" : ""
      }`}
    >
      {/* Checkbox: only for reminders. Items are passive (a flight isn't
       * something you "mark done"). */}
      {isReminder ? (
        <form action={toggleReminderDone} className="mt-0.5">
          <input type="hidden" name="id" value={rawId} />
          <input type="hidden" name="done" value={String(!!e.done)} />
          <button
            type="submit"
            aria-label={e.done ? "Mark not done" : "Mark done"}
            className={`inline-flex h-4 w-4 items-center justify-center rounded border transition-base ${
              e.done
                ? "border-sage bg-sage text-surface"
                : "border-line-strong bg-surface hover:border-ink-muted"
            }`}
          >
            {e.done ? <CheckIcon size={10} /> : null}
          </button>
        </form>
      ) : (
        // Spacer keeps the icon column aligned across reminders + items.
        <span className="mt-0.5 inline-block h-4 w-4 shrink-0" aria-hidden />
      )}

      <span
        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center ${CATEGORY_TINT[e.category]}`}
      >
        <Icon size={13} />
      </span>

      <div className="min-w-0 flex-1">
        {e.upload_id ? (
          <Link
            href={`/dashboard/uploads/${e.upload_id}`}
            className={`text-[13.5px] transition-base ${
              e.done ? "text-ink-muted line-through" : "text-ink hover:text-ink-soft"
            }`}
          >
            {e.title}
          </Link>
        ) : (
          <p
            className={`text-[13.5px] ${
              e.done ? "text-ink-muted line-through" : "text-ink"
            }`}
          >
            {e.title}
          </p>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-faint">
          {showTime ? (
            <span className="inline-flex items-center gap-1">
              <ClockIcon size={11} />
              {formatTime(e.due_at)}
            </span>
          ) : null}
          {/* Item-specific quiet meta: amount, location. */}
          {!isReminder && e.meta?.amount_display ? (
            <span>{e.meta.amount_display}</span>
          ) : null}
          {!isReminder && e.meta?.location ? (
            <span>{e.meta.location}</span>
          ) : null}
          {showSpacePill ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.05] px-2 py-0.5 text-[10.5px] text-ink-muted">
              {e.space_name}
            </span>
          ) : null}
          {suggested ? (
            <span className="inline-flex items-center gap-1 rounded bg-accent-soft/60 px-1.5 py-0.5 text-[10.5px] text-[#7a5a2a]">
              <SparkIcon size={10} /> Suggested
            </span>
          ) : null}
        </div>
      </div>

      {/* Hover actions: only for reminders. Items have no Keep/Delete here —
       * to remove them, the user deletes the underlying upload. */}
      {isReminder ? (
        <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
          {suggested ? (
            <form action={confirmReminder}>
              <input type="hidden" name="id" value={rawId} />
              <button
                type="submit"
                className="text-[11.5px] text-ink-muted hover:text-ink transition-base"
              >
                Keep
              </button>
            </form>
          ) : null}
          <form action={deleteReminder}>
            <input type="hidden" name="id" value={rawId} />
            <button
              type="submit"
              className="text-[11.5px] text-ink-faint hover:text-claret transition-base"
              aria-label="Delete reminder"
            >
              Delete
            </button>
          </form>
        </div>
      ) : null}
    </li>
  );
}
