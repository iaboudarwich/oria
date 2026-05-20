"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While any report on this page is still generating, ping router.refresh
 * every few seconds so the row flips to "Ready" automatically. Stops the
 * polling as soon as nothing is pending, so we don't keep hitting the
 * server for nothing.
 *
 * The actual status flip happens via revalidatePath inside the after()
 * generator — this just nudges the client to pick it up without the user
 * needing to refresh manually.
 */
export function ReportPoller({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 5000);
    return () => window.clearInterval(id);
  }, [pending, router]);
  return null;
}
