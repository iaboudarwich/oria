"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SIDEBAR_EXTRAS_COOKIE, type SidebarExtra } from "./sidebar-prefs";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const ALLOWED_EXTRAS = new Set<SidebarExtra>(["timeline"]);

/**
 * Add or remove an optional sidebar item from the user's prefs. Form
 * data carries `extra` (the key) and `enabled` ("on" | anything else).
 * Cookie is a comma-separated string; small enough that JSON would be
 * overkill.
 *
 * Revalidates the dashboard layout so the sidebar re-renders with the
 * new set.
 */
export async function setSidebarExtra(formData: FormData): Promise<void> {
  const extra = String(formData.get("extra") ?? "").trim();
  if (!ALLOWED_EXTRAS.has(extra as SidebarExtra)) return;
  const enable = String(formData.get("enabled") ?? "") === "on";

  const store = await cookies();
  const current = (store.get(SIDEBAR_EXTRAS_COOKIE)?.value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const set = new Set(current);
  if (enable) set.add(extra);
  else set.delete(extra);

  const value = Array.from(set).join(",");
  if (value) {
    store.set(SIDEBAR_EXTRAS_COOKIE, value, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  } else {
    store.delete(SIDEBAR_EXTRAS_COOKIE);
  }

  revalidatePath("/dashboard", "layout");
}
