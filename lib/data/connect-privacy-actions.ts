"use server";

import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/data/audit-log";

/**
 * Round 14.6 F2: record that the user has seen and acknowledged the privacy
 * step shown before connecting any data source. Sets profiles.connect_privacy
 * _ack_at the first time (idempotent: a re-acknowledge does not move the
 * timestamp), and audit-logs it. RLS scopes the write to the caller.
 */
export async function acknowledgeConnectPrivacy(): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };

    const { data: profile } = await supabase
      .from("profiles")
      .select("connect_privacy_ack_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.connect_privacy_ack_at) return { ok: true }; // already acknowledged

    await supabase
      .from("profiles")
      .update({ connect_privacy_ack_at: new Date().toISOString() })
      .eq("id", user.id);

    await logAuditEvent({
      userId: user.id,
      action: "privacy.connect_acknowledged",
      resourceType: "profile",
      resourceId: user.id,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
