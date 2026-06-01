"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext } from "./organizations";
import { logAuditEvent } from "./audit-log";
import { recordBehaviorSignal } from "./behavior-signals";

function pick<T extends string>(v: FormDataEntryValue | null, allowed: T[], fallback: T): T {
  const s = String(v ?? "");
  return (allowed as string[]).includes(s) ? (s as T) : fallback;
}

function csv(v: FormDataEntryValue | null, max = 8): string[] {
  return String(v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Save explicit user preferences. Upserts via the admin client (scoped by
 * user_id), audits the change, and records a setting_changed behavior signal.
 */
export async function setUserPreferences(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const responseLength = pick(
    formData.get("response_length"),
    ["short", "medium", "long"],
    "medium",
  );
  const formality = pick(
    formData.get("formality"),
    ["casual", "professional"],
    "casual",
  );
  const pinnedMetrics = csv(formData.get("pinned_metrics"));
  const focusAreas = csv(formData.get("focus_areas"));

  const admin = createAdminClient();
  await admin.from("user_preferences").upsert(
    {
      user_id: ctx.profile.id,
      response_length: responseLength,
      formality,
      pinned_metrics: pinnedMetrics,
      focus_areas: focusAreas,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  await logAuditEvent({
    userId: ctx.profile.id,
    action: "settings.preferences.changed",
    metadata: { responseLength, formality },
  });
  void recordBehaviorSignal({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    type: "setting_changed",
    value: { responseLength, formality },
  });

  revalidatePath("/dashboard/settings");
}

/**
 * Clear the user's derived understanding: deletes all behavior_signals for the
 * user while keeping their explicit preferences. Audited.
 */
export async function resetUnderstanding(): Promise<void> {
  const ctx = await requireContext();
  const admin = createAdminClient();
  await admin.from("behavior_signals").delete().eq("user_id", ctx.profile.id);
  await logAuditEvent({
    userId: ctx.profile.id,
    action: "settings.understanding.reset",
  });
  revalidatePath("/dashboard/settings");
}
