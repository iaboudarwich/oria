"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";

const POLL_MS = 5 * 60 * 1000; // check every 5 minutes
const IDLE_MS = 60 * 60 * 1000; // auto-refresh after 60 min idle
const IDLE_CHECK_MS = 60 * 1000; // re-evaluate the idle condition each minute

/**
 * Smart deploy strategy (client side).
 *
 * - Polls /api/version on mount and every 5 minutes. When the live version
 *   differs from the one this bundle was built with, surface a non-blocking
 *   toast offering a refresh.
 * - Idle auto-refresh: if a new version is available AND the user has been
 *   idle for 60 minutes AND nothing is in flight, reload automatically.
 * - In-flight protection: an active upload or unsaved text input suppresses
 *   the auto-refresh; the toast stays so the user can refresh when ready.
 */
export function VersionWatcher({ buildVersion }: { buildVersion: string }) {
  const lastInteractionRef = useRef<number>(0);

  // Standardized on the SWR client cache (Part 2): periodic background refresh
  // via refreshInterval, deduped + revalidated on focus, instead of a
  // hand-rolled setInterval. The version key is app-GLOBAL (no user/space
  // dimension), so it is a plain key, not a scoped one.
  const { data } = useSWR<{ version?: string } | null>(
    "/api/version",
    (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    { refreshInterval: POLL_MS, revalidateOnFocus: true },
  );
  const updateAvailable = !!(data?.version && buildVersion && data.version !== buildVersion);

  // Track the last meaningful interaction for the idle calculation.
  useEffect(() => {
    lastInteractionRef.current = Date.now();
    const mark = () => {
      lastInteractionRef.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = ["click", "keydown", "scroll", "pointerdown"];
    for (const e of events) window.addEventListener(e, mark, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, mark);
    };
  }, []);

  // Idle auto-refresh once an update is available and nothing is in flight.
  useEffect(() => {
    if (!updateAvailable) return;
    const id = window.setInterval(() => {
      const idleFor = Date.now() - lastInteractionRef.current;
      if (idleFor >= IDLE_MS && !hasInFlightWork()) {
        window.location.reload();
      }
    }, IDLE_CHECK_MS);
    return () => window.clearInterval(id);
  }, [updateAvailable]);

  if (!updateAvailable) return null;

  return (
    <div role="status" className="fixed inset-x-0 bottom-4 z-[130] flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-raised px-4 py-2.5 shadow-xl">
        <span className="text-[13px] text-ink">New version available.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="transition-base inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12.5px] font-medium text-surface hover:bg-ink-soft"
        >
          Refresh to update
        </button>
      </div>
    </div>
  );
}

/** True when refreshing now would interrupt the user (active upload or
 *  unsaved text in a focused field). */
function hasInFlightWork(): boolean {
  if (typeof window === "undefined") return false;
  const uploads = (window as unknown as { __oriaUploadsActive?: number }).__oriaUploadsActive;
  if (typeof uploads === "number" && uploads > 0) return true;

  const el = document.activeElement;
  if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) {
    const value = (el as HTMLInputElement | HTMLTextAreaElement).value;
    if (value && value.trim().length > 0) return true;
  }
  return false;
}
