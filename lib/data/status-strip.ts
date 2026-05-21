import "server-only";

import { cookies } from "next/headers";

const SEEN_COOKIE = "oria_status_seen";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Last-event-id the user dismissed from the topbar status strip. Comparing
 * the latest fresh event's id to this cookie tells us whether to show the
 * strip at all. We don't store per-event read state in the database — a
 * single cookie is enough for the calm in-app surface we want.
 */
export async function readLastStatusSeenId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SEEN_COOKIE)?.value ?? null;
}

export async function writeLastStatusSeenId(id: string): Promise<void> {
  const store = await cookies();
  store.set(SEEN_COOKIE, id, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
}
