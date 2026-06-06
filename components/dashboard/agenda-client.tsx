"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClockIcon, FlagIcon } from "@/components/ui/icon";
import { setReminderFlagged } from "@/lib/data/reminder-actions";
import {
  filterSavedView,
  savedViewCounts,
  SAVED_VIEW_KEYS,
  type SavedViewKey,
} from "@/lib/views/saved-views";
import { bucketByTime, DAY_BUCKETS, bucketForHour, type DayBucket } from "@/lib/daily/time-buckets";
import { getLocalParts } from "@/lib/utils/tz";

export type AgendaItem = {
  id: string;
  reminderId: string | null;
  title: string;
  whenISO: string;
  done: boolean;
  flagged: boolean;
  href: string;
  spaceLabel: string | null;
};

/**
 * Today's agenda with Smart-List saved views and time buckets (Round A). The
 * "Today" view groups the day into Morning / Afternoon / Evening (bucketByTime)
 * with a subtle current-time highlight; Overdue / This week / Flagged render a
 * flat list. All four are pure filters (filterSavedView) over the same flat
 * reminder/event items, which the client already holds, so a view surfaces
 * items, it never owns them. Reminders can be flagged inline.
 */
export function AgendaClient({
  items,
  tz,
  nowISO,
}: {
  items: AgendaItem[];
  tz: string | null;
  nowISO: string;
}) {
  const t = useTranslations("agenda");
  const router = useRouter();
  const [view, setView] = useState<SavedViewKey>("today");
  const [pending, startTransition] = useTransition();

  const counts = savedViewCounts(items, nowISO, tz);
  const shown = filterSavedView(items, view, nowISO, tz);
  const nowHour = getLocalParts(new Date(nowISO), tz).hour;
  const currentBucket = bucketForHour(nowHour);

  function toggleFlag(it: AgendaItem) {
    if (!it.reminderId) return;
    startTransition(async () => {
      await setReminderFlagged({ id: it.reminderId!, flagged: !it.flagged });
      router.refresh();
    });
  }

  const Row = ({ it, accent }: { it: AgendaItem; accent?: boolean }) => (
    <li>
      <div
        className={`group transition-base flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-raised ${
          accent ? "border-s-2 border-brand bg-brand-soft/30" : ""
        }`}
      >
        <Link href={it.href} className="flex min-w-0 flex-1 items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-[13px] text-ink">{it.title}</p>
          {it.spaceLabel ? (
            <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-[10.5px] text-ink-muted">
              {it.spaceLabel}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-faint tabular-nums">
            <ClockIcon size={11} />
            {formatTime(it.whenISO, tz)}
          </span>
        </Link>
        {it.reminderId ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => toggleFlag(it)}
            aria-label={it.flagged ? t("unflag") : t("flag")}
            aria-pressed={it.flagged}
            className={`transition-base shrink-0 ${it.flagged ? "text-warning" : "text-ink-faint hover:text-ink"}`}
          >
            <FlagIcon size={13} />
          </button>
        ) : null}
      </div>
    </li>
  );

  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[13px] font-medium text-ink-muted">{t("title")}</h2>
        <Link
          href="/dashboard/calendar"
          className="transition-base text-[12px] text-ink-faint hover:text-ink"
        >
          {t("open_calendar")}
        </Link>
      </div>

      {/* Saved-view chips */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {SAVED_VIEW_KEYS.filter((k) => k !== "all").map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setView(k)}
            aria-pressed={view === k}
            className={`transition-base rounded-full px-2.5 py-1 text-[11.5px] font-medium ${
              view === k ? "bg-ink text-surface" : "bg-surface-raised text-ink-muted hover:text-ink"
            }`}
          >
            {t(`view_${k}`)}
            {counts[k] > 0 ? (
              <span className="ms-1 tabular-nums opacity-70">{counts[k]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="px-1 text-[13px] text-ink-faint">{t("empty")}</p>
      ) : view === "today" ? (
        (() => {
          const bucketed = bucketByTime(shown, tz);
          return (
            <div className="space-y-3">
              {DAY_BUCKETS.map((b: DayBucket) =>
                bucketed[b].length ? (
                  <div key={b}>
                    <p className="text-eyebrow mb-1 flex items-center gap-2 px-1">
                      {t(`bucket_${b}`)}
                      {b === currentBucket ? (
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full bg-brand"
                          aria-label={t("now")}
                        />
                      ) : null}
                    </p>
                    <ul className="space-y-0.5">
                      {bucketed[b].map((it, i) => (
                        <Row
                          key={it.id}
                          it={it as AgendaItem}
                          accent={b === currentBucket && i === 0}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          );
        })()
      ) : (
        <ul className="space-y-0.5">
          {shown.map((it) => (
            <Row key={it.id} it={it as AgendaItem} />
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTime(iso: string, tz: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (tz) opts.timeZone = tz;
  if (d.getHours() === 0 && d.getMinutes() === 0) return "";
  return d.toLocaleTimeString(undefined, opts);
}
