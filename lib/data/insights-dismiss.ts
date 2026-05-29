import "server-only";

import { cookies } from "next/headers";

const COOKIE = "oria_insights_dismissed";
const ONE_MONTH = 60 * 60 * 24 * 30;
const MAX_DISMISSED = 40;

/**
 * Per-user list of insight ids the user has waved away. Stored in a
 * cookie keyed to a comma-separated list. small, no DB. We trim to
 * the most-recent MAX_DISMISSED to keep the cookie payload tiny; if
 * an insight resurfaces because its id rolled off, that's fine. the
 * user can dismiss it again.
 *
 * Cookie writes happen only in a Server Action (see
 * insights-dismiss-actions.ts), so the read path is pure.
 */
export async function readDismissedInsightIds(): Promise<Set<string>> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value ?? "";
  if (!raw) return new Set();
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export async function writeDismissedInsightIds(
  ids: Set<string>,
): Promise<void> {
  const store = await cookies();
  const list = Array.from(ids).slice(-MAX_DISMISSED).join(",");
  store.set(COOKIE, list, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_MONTH,
  });
}
