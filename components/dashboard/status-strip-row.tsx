"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ackStatusStrip } from "@/lib/data/status-strip-actions";

const AUTO_DISMISS_MS = 3000;

/**
 * One status row that fades in, then auto-dismisses after 3 seconds (paused
 * while hovered). Acknowledging persists the last-seen id so it does not
 * reappear. A small "view in history" link and an explicit close are offered.
 */
export function StatusStripRow({
  id,
  message,
  severity,
  historyLabel,
}: {
  id: string;
  message: string;
  severity: "info" | "error" | string;
  historyLabel: string;
}) {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const hovering = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dismiss() {
    if (gone) return;
    setLeaving(true);
    void ackStatusStrip(id);
    window.setTimeout(() => setGone(true), 200);
  }

  useEffect(() => {
    const schedule = () => {
      timer.current = setTimeout(() => {
        if (hovering.current) {
          schedule();
        } else {
          dismiss();
        }
      }, AUTO_DISMISS_MS);
    };
    schedule();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone) return null;

  const tone =
    severity === "error"
      ? "border-claret/30 bg-claret/[0.06] text-claret"
      : "border-line bg-canvas/70 text-ink-muted";

  return (
    <div
      onMouseEnter={() => (hovering.current = true)}
      onMouseLeave={() => (hovering.current = false)}
      className={`mt-2 flex items-center gap-3 rounded-lg border px-3 py-1.5 text-[12px] transition-opacity duration-200 ${tone} ${
        leaving ? "opacity-0" : "animate-fade-in opacity-100"
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
          severity === "error" ? "bg-claret" : "bg-sage"
        }`}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{message}</span>
      <Link
        href="/dashboard/timeline"
        className="shrink-0 text-[11.5px] text-ink-faint underline-offset-2 transition-base hover:text-ink hover:underline"
      >
        {historyLabel}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-[13px] leading-none text-ink-faint transition-base hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}
