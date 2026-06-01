import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type BehaviorSignalType =
  | "section_visited"
  | "query_asked"
  | "upload_categorized"
  | "reminder_dismissed"
  | "reminder_acted_on"
  | "summary_card_clicked"
  | "setting_changed";

/**
 * Record a behavior signal. Fire-and-forget: never awaited on the critical
 * path, never throws, swallows all errors. Writes go through the admin client
 * because behavior_signals has no INSERT policy for the authenticated role
 * (reads are RLS-locked to the owner; writes are service-role only).
 */
export async function recordBehaviorSignal(input: {
  userId: string;
  organizationId?: string | null;
  type: BehaviorSignalType;
  value?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("behavior_signals").insert({
      user_id: input.userId,
      organization_id: input.organizationId ?? null,
      signal_type: input.type,
      signal_value: input.value ?? {},
    });
  } catch {
    // Best-effort telemetry. Never affects the user-facing path.
  }
}
