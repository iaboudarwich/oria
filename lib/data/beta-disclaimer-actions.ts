"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Set profiles.beta_disclaimer_acknowledged_at = now() for the active
 * user. Idempotent: if it's already set, the row update is a no-op.
 *
 * Uses the service-role admin client so it works on the very first
 * load (the RLS-bound client also works, but the admin client avoids
 * any race with the row being trigger-bootstrapped on first sign-in).
 */
export async function acknowledgeBetaDisclaimer(): Promise<void> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ beta_disclaimer_acknowledged_at: new Date().toISOString() })
    .eq("id", userData.user.id);
}
