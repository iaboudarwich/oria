import "server-only";

import { postSidecar } from "@/lib/cloud/shared/sidecar-post";

// Next.js -> Python sidecar client for the Google cloud services (Drive fetch +
// indexing, Calendar sync). Uses the shared signed-POST helper.
//
// The access token travels only in the signed server-to-server request body and
// is never logged.

export type DriveFileMeta = {
  provider_file_id: string;
  name: string;
  mime_type: string;
  web_view_link: string | null;
  icon_link: string | null;
  thumbnail_link: string | null;
  size_bytes: number | null;
  modified_time: string | null;
  excerpt: string;
  accessible: boolean;
};

/** Fetch metadata + a short text excerpt for each picked Drive file. */
export async function driveIndex(accessToken: string, fileIds: string[]): Promise<DriveFileMeta[]> {
  const out = await postSidecar<{ files: DriveFileMeta[] }>(
    "/cloud/drive/index",
    { access_token: accessToken, file_ids: fileIds },
    120_000,
  );
  return out?.files ?? [];
}

/** List the (non-folder) files directly inside one Drive folder. */
export async function driveListFolder(
  accessToken: string,
  folderId: string,
): Promise<DriveFileMeta[]> {
  const out = await postSidecar<{ files: DriveFileMeta[] }>(
    "/cloud/drive/list-folder",
    { access_token: accessToken, folder_id: folderId },
    120_000,
  );
  return out?.files ?? [];
}

export type DriveFetchResult = {
  text: string;
  accessible: boolean;
};

/** Fetch + parse the full text content of one Drive file (fetch-on-demand). */
export async function driveFetch(
  accessToken: string,
  providerFileId: string,
  mimeType: string,
): Promise<DriveFetchResult | null> {
  return postSidecar<DriveFetchResult>(
    "/cloud/drive/fetch",
    { access_token: accessToken, provider_file_id: providerFileId, mime_type: mimeType },
    60_000,
  );
}

export type SyncedCalendarEvent = {
  provider_event_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  organizer_email: string | null;
  attendees: { email: string; name?: string | null }[];
  web_view_link: string | null;
};

/** Pull a window of Calendar events for classification + routing. */
export async function calendarSync(
  accessToken: string,
  pastDays: number,
  futureDays: number,
): Promise<SyncedCalendarEvent[]> {
  const out = await postSidecar<{ events: SyncedCalendarEvent[] }>(
    "/cloud/calendar/sync",
    { access_token: accessToken, past_days: pastDays, future_days: futureDays },
    120_000,
  );
  return out?.events ?? [];
}
