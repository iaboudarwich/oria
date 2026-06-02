"use server";

import { writeLastStatusSeenId } from "./status-strip";

/**
 * Mark the topbar status strip as dismissed up to (and including) this
 * event id. Future renders compare the next-newest event id against the
 * cookie and show the strip again only when there's something new.
 */
export async function dismissStatusStrip(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await writeLastStatusSeenId(id);
}

/** Same as dismissStatusStrip but callable directly from a client component
 *  (e.g. the auto-dismiss timer), without a form submission. */
export async function ackStatusStrip(id: string): Promise<void> {
  const trimmed = id.trim();
  if (!trimmed) return;
  await writeLastStatusSeenId(trimmed);
}
