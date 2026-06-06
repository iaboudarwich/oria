"use client";

import { useTransition } from "react";
import { outlookSetStatus, outlookDisconnect } from "@/lib/microsoft/mail-actions";

export type OutlookMailView = {
  id: string;
  status: "active" | "paused" | "revoked" | "error";
  lastSyncLabel: string;
};

export type OutlookMailLabels = {
  mail: string;
  statusActive: string;
  statusPaused: string;
  statusError: string;
  statusRevoked: string;
  lastSync: string; // contains "{time}"
  pause: string;
  resume: string;
  disconnect: string;
};

const DOT: Record<string, string> = {
  active: "bg-sage",
  paused: "bg-ink-faint",
  error: "bg-claret",
  revoked: "bg-claret",
};

/** One connected Outlook mailbox row: status, pause/resume, disconnect. */
export function OutlookMailRow({
  view,
  labels,
}: {
  view: OutlookMailView;
  labels: OutlookMailLabels;
}) {
  const [pending, startTransition] = useTransition();
  const statusLabel =
    view.status === "active"
      ? labels.statusActive
      : view.status === "paused"
        ? labels.statusPaused
        : view.status === "error"
          ? labels.statusError
          : labels.statusRevoked;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${DOT[view.status] ?? "bg-ink-faint"}`}
        aria-hidden
      />
      <span className="text-[12.5px] font-medium text-ink">{labels.mail}</span>
      <span className="text-[11.5px] text-ink-faint">
        {statusLabel} · {labels.lastSync.replace("{time}", view.lastSyncLabel)}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() =>
            outlookSetStatus(view.id, view.status === "paused" ? "active" : "paused"),
          )
        }
        className="transition-base ml-auto rounded-lg border border-line px-2 py-1 text-[11.5px] text-ink-muted hover:bg-surface disabled:opacity-50"
      >
        {view.status === "paused" ? labels.resume : labels.pause}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => outlookDisconnect(view.id))}
        className="transition-base rounded-lg border border-line px-2 py-1 text-[11.5px] text-claret hover:bg-surface disabled:opacity-50"
      >
        {labels.disconnect}
      </button>
    </div>
  );
}
