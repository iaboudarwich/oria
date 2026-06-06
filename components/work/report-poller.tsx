"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While any report on this page is still generating, refresh the route
 * data so the row flips to "Ready" automatically. The actual status
 * flip happens via revalidatePath inside the after() generator. this
 * just nudges the client to pick it up without the user needing to
 * refresh manually.
 *
 * Cadence is back-off: short while the user is most likely watching
 * (1.5s, 2.5s, 4s, 6s, 6s, 6s …) so the row flips fast for short
 * reports, then settles into a low-pressure poll. Stops as soon as
 * nothing is pending.
 */
const POLL_SCHEDULE_MS = [1500, 2500, 4000, 6000];

export function ReportPoller({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let tick = 0;

    function schedule() {
      if (cancelled) return;
      const delay = POLL_SCHEDULE_MS[Math.min(tick, POLL_SCHEDULE_MS.length - 1)];
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
