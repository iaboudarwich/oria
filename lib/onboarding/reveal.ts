import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * True when the user just finished the new onboarding flow and hasn't dismissed
 * the reveal yet: onboarding_completed_at is null AND an initial_setup plan
 * exists. This never fires for users who onboarded the old way (no plan row).
 */
export async function shouldShowReveal(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();
  if ((profile as { onboarding_completed_at: string | null } | null)?.onboarding_completed_at) {
    return false;
  }
  const { data: plan } = await admin
    .from("onboarding_setup_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "initial_setup")
    .limit(1)
    .maybeSingle();
  return !!plan;
}
