"use client";

import { useState } from "react";

export type StripEvent = {
  id: string;
  title: string;
  location: string | null;
  startsAt: string;
  isAllDay: boolean;
  webViewLink: string | null;
};

/**
 * A subtle, dismissible strip of the next day or two of calendar events. Shown
 * at the top of the dashboard once a Calendar account is connected and there
 * are upcoming events. Dismissal is per-session.
 */
export function UpcomingEventsStrip({
  events,
  heading,
  dismissLabel,
}: {
  events: StripEvent[];
  heading: string;
  dismissLabel: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || events.length === 0) return null;

  return (
    <div className="rounded-2xl border border-line bg-surface-raised px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold tracking-[0.05em] text-ink-faint uppercase">
          {heading}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={dismissLabel}
          className="text-[12px] text-ink-faint hover:text-ink"
        >
          ✕
        </button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {events.map((e) => {
          const when = e.isAllDay
            ? new Date(e.startsAt).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })
            : new Date(e.startsAt).toLocaleString(undefined, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              });
          const inner = (
            <>
              <span className="font-medium text-ink">{e.title}</span>
              <span className="text-ink-faint"> · {when}</span>
              {e.location ? <span className="text-ink-faint"> · {e.location}</span> : null}
            </>
          );
          return (
            <li
              key={e.id}
              className="rounded-lg border border-line bg-canvas px-2.5 py-1 text-[12px]"
            >
              {e.webViewLink ? (
                <a
                  href={e.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {inner}
                </a>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
