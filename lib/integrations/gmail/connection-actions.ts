"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  setGmailConnectionStatus,
  updateConnectionFilters,
  type ConnectionFilterConfig,
} from "./connections";

export type AutoRoutePreference = "always_review" | "auto_confident" | "auto_all";
const VALID_PREFS: AutoRoutePreference[] = ["always_review", "auto_confident", "auto_all"];

/** Save the user's auto-routing preference (how aggressively to auto-add). */
export async function setAutoRoutePreference(pref: AutoRoutePreference): Promise<{ ok: boolean }> {
  if (!VALID_PREFS.includes(pref)) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  // Admin client: profiles updates are gated by a trigger-friendly RLS policy,
  // and this only writes the user's own row.
  await createAdminClient()
    .from("profiles")
    .update({ auto_route_preference: pref })
    .eq("id", user.id);
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/** Save one connection's confidentiality filters + workspace routing. */
export async function saveConnectionFilters(
  connectionId: string,
  config: ConnectionFilterConfig,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !connectionId) return { ok: false };

  const routing = config.workspaceRouting;
  const mode = config.routingMode === "fixed" ? "fixed" : "auto";
  await updateConnectionFilters(user.id, connectionId, {
    excludeKeywords: (config.excludeKeywords ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50),
    excludeSenders: (config.excludeSenders ?? [])
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50),
    excludeWithAttachments: !!config.excludeWithAttachments,
    workspaceRouting: routing === "work" || routing === "auto" ? routing : "personal",
    routingMode: mode,
    routingTargetOrgIds: mode === "fixed" ? (config.routingTargetOrgIds ?? []).slice(0, 20) : [],
  });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/**
 * Pause or resume one Gmail connection's sync (by id). Paused connections are
 * skipped by the sync cron until resumed. No token material is touched.
 */
export async function setGmailPaused(
  connectionId: string,
  paused: boolean,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !connectionId) return { ok: false };
  await setGmailConnectionStatus(user.id, connectionId, paused ? "paused" : "active");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
