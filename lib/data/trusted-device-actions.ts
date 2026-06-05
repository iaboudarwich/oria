"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/data/audit-log";
import { TRUSTED_DEVICE_COOKIE, hashToken } from "@/lib/auth/trusted-device";

/**
 * Revoke a trusted device (from Settings). The device must then pass the second
 * factor again on its next sign-in. If the revoked device is THIS one, the
 * cookie is cleared too. Owner-scoped via RLS; audit-logged.
 */
export async function revokeTrustedDevice(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: row } = await supabase
    .from("trusted_devices")
    .select("id, token_hash, label")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row) return { ok: false };

  const { error } = await supabase
    .from("trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { ok: false };

  // If we're revoking the current device, drop its cookie so it stops being
  // treated as trusted immediately.
  const jar = await cookies();
  const token = jar.get(TRUSTED_DEVICE_COOKIE)?.value;
  if (token && hashToken(token) === (row as { token_hash: string }).token_hash) {
    jar.delete(TRUSTED_DEVICE_COOKIE);
  }

  await logAuditEvent({
    userId: user.id,
    action: "device.revoked",
    resourceType: "trusted_device",
    resourceId: id,
    metadata: { label: (row as { label: string | null }).label },
  });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
