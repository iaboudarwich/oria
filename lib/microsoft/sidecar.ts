import "server-only";

import { sidecarAuthHeaders } from "@/lib/google/shared/sidecar-auth";
import type { DriveFileMeta, DriveFetchResult, SyncedCalendarEvent } from "@/lib/google/sidecar";

// Next.js -> sidecar client for OneDrive (index + fetch-on-demand). Reuses the
// same metadata/fetch shapes as the Drive client so the cloud_files pipeline is
// provider-agnostic. Tokens travel only in the signed body and are never logged.

const SIDECAR_URL =
  process.env.PYTHON_EXTRACTION_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

async function postSidecar<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  try {
    const res = await fetch(`${SIDECAR_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sidecarAuthHeaders("POST", path) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(`[microsoft/sidecar] ${path} HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[microsoft/sidecar] ${path} failed:`, (err as Error).name);
    return null;
  }
}

/** Fetch metadata + a short text excerpt for each picked OneDrive item. */
export async function onedriveIndex(accessToken: string, itemIds: string[]): Promise<DriveFileMeta[]> {
  const out = await postSidecar<{ files: DriveFileMeta[] }>(
    "/cloud/onedrive/index",
    { access_token: accessToken, item_ids: itemIds },
    120_000,
  );
  return out?.files ?? [];
}

/** Fetch + parse the full text content of one OneDrive item (fetch-on-demand). */
export async function onedriveFetch(
  accessToken: string,
  itemId: string,
  mimeType: string,
): Promise<DriveFetchResult | null> {
  return postSidecar<DriveFetchResult>(
    "/cloud/onedrive/fetch",
    { access_token: accessToken, item_id: itemId, mime_type: mimeType },
    60_000,
  );
}

/** Pull a window of Outlook calendar events for classification + routing. */
export async function outlookCalendarSync(
  accessToken: string,
  pastDays: number,
  futureDays: number,
): Promise<SyncedCalendarEvent[]> {
  const out = await postSidecar<{ events: SyncedCalendarEvent[] }>(
    "/outlook/calendar/sync",
    { access_token: accessToken, past_days: pastDays, future_days: futureDays },
    120_000,
  );
  return out?.events ?? [];
}
