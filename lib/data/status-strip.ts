import "server-only";

import { cookies } from "next/headers";

const SEEN_COOKIE = "oria_status_seen";
const FLASH_COOKIE = "oria_status_flash";
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

/**
 * One-shot flash messages for self-facing confirmations the database
 * doesn't model (e.g. "You joined Family Circle"). The writer sets it
 * right before redirecting, the topbar reads it on the next render and
 * clears it so it never shows twice.
 *
 * Format: a JSON-ish string is overkill for one message — we use plain
 * text. Cleared the same way it was set, on the next read.
 */
export async function readAndClearStatusFlash(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(FLASH_COOKIE)?.value ?? null;
  if (value) {
    store.set(FLASH_COOKIE, "", {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return value || null;
}

export async function writeStatusFlash(message: string): Promise<void> {
  const store = await cookies();
  store.set(FLASH_COOKIE, message, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    // Short lifetime: the next dashboard render consumes and clears it.
    maxAge: 60,
  });
}
