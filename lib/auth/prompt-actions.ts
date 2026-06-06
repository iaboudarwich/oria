"use server";

import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/data/audit-log";

/**
 * Record that the two-factor setup prompt was shown to or dismissed by the
 * user. Used for the one-time post-signup encouragement modal. Fire-and-forget;
 * never blocks the UI.
 */
export async function recordTwoFactorPrompt(kind: "shown" | "dismissed"): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await logAuditEvent({
    userId: user.id,
    action: kind === "shown" ? "2fa.prompt_shown" : "2fa.prompt_dismissed",
    resourceType: "mfa",
  });
}
