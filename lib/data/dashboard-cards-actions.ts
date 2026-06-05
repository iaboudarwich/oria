"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext } from "./organizations";
import { logAuditEvent } from "./audit-log";
import { parseCardPrefs } from "@/lib/daily/stat-cards";

/**
 * Persist the user's Today daily-stats layout (order + hidden). Stored on the
 * per-user user_preferences row (RLS own-row). Sanitized through parseCardPrefs
 * so a forged payload can only ever set known keys. Audited.
 */
export async function setDashboardCardPrefs(prefs: unknown): Promise<{ ok: boolean }> {
  const ctx = await requireContext();
  const clean = parseCardPrefs(prefs);
  const admin = createAdminClient();
  const { error } = await admin.from("user_preferences").upsert(
    {
      user_id: ctx.profile.id,
      dashboard_cards: clean,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false };
  await logAuditEvent({
    userId: ctx.profile.id,
    action: "settings.preferences.changed",
    metadata: { dashboard_cards: clean.length },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}
