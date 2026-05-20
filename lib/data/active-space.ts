import "server-only";
import { cookies } from "next/headers";

/**
 * Name of the cookie that pins the user's active space. The value is the
 * organization_id the user is currently viewing.
 *
 * Behavior:
 *   - If the cookie is absent, getCurrentContext picks the user's first
 *     membership (typically their personal space).
 *   - If the cookie points at an org the user is NOT a member of, it is
 *     silently ignored (getCurrentContext falls back to first membership).
 *     This guards against stale cookies after being removed from a circle.
 */
export const ACTIVE_SPACE_COOKIE = "oria_active_org";

export async function getActiveSpaceCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_SPACE_COOKIE)?.value ?? null;
}
