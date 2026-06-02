"use client";

import { useState, useTransition } from "react";
import { cloudDisconnect, cloudSetStatus, cloudUpdateRouting } from "@/lib/google/cloud-actions";

export type CloudServiceView = {
  id: string;
  service: "calendar" | "drive" | "onedrive" | "outlook_calendar";
  status: "active" | "paused" | "error" | "revoked";
  routingMode: "auto" | "fixed";
  routingTargetOrgId: string | null;
  lastSyncLabel: string;
};

export type SpaceChoice = { id: string; name: string };

export type CloudRowLabels = {
  serviceCalendar: string;
  serviceDrive: string;
  statusActive: string;
  statusPaused: string;
  statusError: string;
  statusRevoked: string;
  lastSync: string; // e.g. "Synced {time}"
  pause: string;
  resume: string;
  disconnect: string;
  routeAuto: string;
  routeFixed: string;
};

const DOT: Record<string, string> = {
  active: "bg-sage",
  paused: "bg-ink-faint",
  error: "bg-claret",
  revoked: "bg-claret",
};

/**
 * One connected Google service (Calendar or Drive) under an account card.
 * Status, last sync, routing (Calendar only), pause/resume, disconnect.
 */
export function CloudConnectionRow({
  view,
  spaces,
  labels,
}: {
  view: CloudServiceView;
  spaces: SpaceChoice[];
  labels: CloudRowLabels;
}) {
  const [pending, startTransition] = useTransition();
  const [routingMode, setRoutingMode] = useState(view.routingMode);
  const [target, setTarget] = useState(view.routingTargetOrgId ?? "");

  const isCalendar = view.service === "calendar" || view.service === "outlook_calendar";
  const statusLabel =
    view.status === "active"
      ? labels.statusActive
      : view.status === "paused"
        ? labels.statusPaused
        : view.status === "error"
          ? labels.statusError
          : labels.statusRevoked;

  function applyRouting(mode: "auto" | "fixed", t: string) {
    setRoutingMode(mode);
    setTarget(t);
    startTransition(() => cloudUpdateRouting(view.id, mode, mode === "fixed" ? t || null : null));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[view.status] ?? "bg-ink-faint"}`} aria-hidden />
      <span className="text-[12.5px] font-medium text-ink">
        {isCalendar ? labels.serviceCalendar : labels.serviceDrive}
      </span>
      <span className="text-[11.5px] text-ink-faint">
        {statusLabel} · {labels.lastSync.replace("{time}", view.lastSyncLabel)}
      </span>

      {isCalendar ? (
        <select
          value={routingMode === "fixed" ? target : "auto"}
          disabled={pending}
          onChange={(e) =>
            e.target.value === "auto" ? applyRouting("auto", "") : applyRouting("fixed", e.target.value)
          }
          className="ml-auto rounded-lg border border-line bg-surface px-2 py-1 text-[11.5px] text-ink"
        >
          <option value="auto">{labels.routeAuto}</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {labels.routeFixed}: {s.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="ml-auto" />
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() =>
            cloudSetStatus(view.id, view.status === "paused" ? "active" : "paused"),
          )
        }
        className="rounded-lg border border-line px-2 py-1 text-[11.5px] text-ink-muted transition-base hover:bg-surface disabled:opacity-50"
      >
        {view.status === "paused" ? labels.resume : labels.pause}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => cloudDisconnect(view.id))}
        className="rounded-lg border border-line px-2 py-1 text-[11.5px] text-claret transition-base hover:bg-surface disabled:opacity-50"
      >
        {labels.disconnect}
      </button>
    </div>
  );
}
