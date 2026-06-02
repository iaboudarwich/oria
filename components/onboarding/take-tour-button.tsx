"use client";

import { TOUR_OPEN_EVENT } from "./feature-tour";

/** Re-opens the one-time feature tour from the feature index. */
export function TakeTourButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(TOUR_OPEN_EVENT))}
      className="shrink-0 rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink transition-base hover:bg-surface"
    >
      {label}
    </button>
  );
}
