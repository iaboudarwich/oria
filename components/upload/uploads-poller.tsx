"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refresh the inbox route data while at least one upload is in
 * "Reading…" so the row flips to ready or failed without the user
 * having to reload. Same back-off cadence as the work-report poller:
 * short while the user is most likely watching, then settles into a
 * low-pressure heartbeat.
 *
 * Inert when `pending` is false — the component renders nothing and
 * the effect immediately bails. Stops on unmount.
 */
const POLL_SCHEDULE_MS = [2000, 3000, 5000, 8000];

export function UploadsPoller({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let tick = 0;

    function schedule() {
      if (cancelled) return;
      const delay =
        POLL_SCHEDULE_MS[Math.min(tick, POLL_SCHEDULE_MS.length - 1)];
      tick += 1;
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        router.refresh();
        schedule();
      }, delay);
    }
    schedule();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [pending, router]);
  return null;
}
