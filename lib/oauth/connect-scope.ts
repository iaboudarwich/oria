import "server-only";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Carries the Settings "editing scope" through an OAuth connect so the new
 * connection starts feeding the space the user chose ("Connect Gmail to
 * Work - Acme"). The start routes stash the chosen org id in a short-lived
 * httpOnly cookie; the callbacks read it (validated against membership), use it
 * as the scan's target space, then clear it. Absent cookie = today's behavior
 * (the active space), so this is fully backward compatible.
 *
 * This only sets the INITIAL target using the existing per-connection routing;
 * the richer routing/filtering UI and same-account-multi-scope stay in 21.5.
 */

const COOKIE = "oria_connect_org";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setConnectScopeCookie(orgId: string | null): Promise<void> {
  if (!orgId || !UUID.test(orgId)) return;
  const store = await cookies();
  store.set(COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
}

/** Read the chosen connect scope and clear it (single use). Returns the org id
 *  only when the user is actually a member of it. */
export async function takeConnectScope(userId: string): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value ?? null;
  store.delete(COOKIE);
  if (!raw || !UUID.test(raw)) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("memberships")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("organization_id", raw)
      .maybeSingle();
    return data ? raw : null;
  } catch {
    return null;
  }
}
