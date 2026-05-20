"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const CONFIRMATION_PHRASE = "delete my account";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Permanently delete the signed-in user.
 *
 * Steps:
 *  1. For each organization the user belongs to where they are the sole
 *     member, delete the org. ON DELETE CASCADE drops all uploads, items,
 *     memberships, etc. We also remove the storage objects for those orgs.
 *  2. For any shared org (other members exist), drop only the membership.
 *  3. Delete the auth user via the admin API. profiles.id has
 *     `references auth.users on delete cascade`, so the profile and the
 *     remaining memberships drop with it.
 *  4. Sign out and redirect to /login.
 *
 * Requires a typed confirmation matching CONFIRMATION_PHRASE.
 */
export async function deleteAccount(
  formData: FormData,
): Promise<DeleteAccountResult> {
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation.toLowerCase() !== CONFIRMATION_PHRASE) {
    return {
      ok: false,
      error: `Type "${CONFIRMATION_PHRASE}" to confirm.`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const admin = createAdminClient();

  const { data: myMemberships } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id);
  const orgIds = (myMemberships ?? []).map(
    (m: { organization_id: string }) => m.organization_id,
  );

  for (const orgId of orgIds) {
    const { count } = await admin
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    const memberCount = count ?? 0;
    if (memberCount > 1) continue;

    const { data: uploadRows } = await admin
      .from("uploads")
      .select("storage_path")
      .eq("organization_id", orgId);
    const paths = (uploadRows ?? [])
      .map((r: { storage_path: string }) => r.storage_path)
      .filter(Boolean);
    if (paths.length > 0) {
      await admin.storage
        .from("uploads")
        .remove(paths)
        .catch(() => {});
    }

    await admin.from("organizations").delete().eq("id", orgId);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return { ok: false, error: deleteError.message };
  }

  await supabase.auth.signOut();
  // Account is gone; clearing the login page is enough — no need to
  // revalidate the dashboard tree they can no longer access.
  redirect("/login?notice=Your+account+has+been+deleted.");
}
