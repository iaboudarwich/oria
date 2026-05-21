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
 * right before redirecting (in a Server Action). The topbar reads it
 * on the next render.
 *
 * We DON'T clear the cookie in the read path — Next.js only permits
 * cookie writes inside Server Actions or Route Handlers, and the
 * topbar is a Server Component during render. Instead the cookie has
 * a tight 20-second TTL, which is more than enough for the redirect →
 * dashboard hop and short enough that a deliberate refresh a moment
 * later won't show the message twice in practice.
 */
export async function readStatusFlash(): Promise<string | null> {
  const store = await cookies();
  return store.get(FLASH_COOKIE)?.value || null;
}

export async function writeStatusFlash(message: string): Promise<void> {
  const store = await cookies();
  store.set(FLASH_COOKIE, message, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    // Short lifetime so the message disappears even without an explicit
    // dismissal. The user sees it on the redirect render; subsequent
    // navigations stay clean.
    maxAge: 20,
  });
}
