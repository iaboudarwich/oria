"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordSystemEvent } from "@/lib/data/system-events";
import { logAuditEvent } from "@/lib/data/audit-log";

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

  // Log BEFORE the delete. The audit row will cascade-drop with the
  // profile, which is GDPR-correct (the user's data goes with them);
  // logging after wouldn't even have a user_id to attach to.
  await logAuditEvent({
    userId: user.id,
    action: "account.delete",
    metadata: { orgs_dropped: orgIds.length },
  });

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return { ok: false, error: deleteError.message };
  }

  await supabase.auth.signOut();
  // Account is gone; clearing the login page is enough. no need to
  // revalidate the dashboard tree they can no longer access.
  redirect("/login?notice=Your+account+has+been+deleted.");
}

const RESET_PHRASE = "reset my account";

export type ResetAccountResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Wipe all user-generated content from the signed-in user's account
 * without deleting the account itself.
 *
 * Preserved: auth user, profile, memberships in shared orgs, sent invites.
 * Deleted: uploads (+ storage), reminders, conversations, memory items,
 *   custom sections in personal org, learning events, onboarding dismissals.
 *
 * Requires typed confirmation matching RESET_PHRASE.
 */
export async function resetAccount(
  formData: FormData,
): Promise<ResetAccountResult> {
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation.toLowerCase() !== RESET_PHRASE) {
    return {
      ok: false,
      error: `Type "${RESET_PHRASE}" to confirm.`,
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

  // Find which orgs the user is a member of.
  const { data: myMemberships } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id);
  const orgIds = (myMemberships ?? []).map(
    (m: { organization_id: string }) => m.organization_id,
  );

  // Identify personal orgs (sole member). safe to fully wipe.
  const personalOrgIds: string[] = [];
  for (const orgId of orgIds) {
    const { count } = await admin
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    if ((count ?? 0) <= 1) personalOrgIds.push(orgId);
  }

  // 1. Delete uploads in personal orgs (cascades extractions, memory_items,
  //    reminders linked via upload_id, document_chunks, etc.).
  for (const orgId of personalOrgIds) {
    const { data: uploadRows } = await admin
      .from("uploads")
      .select("storage_path")
      .eq("organization_id", orgId);
    const paths = (uploadRows ?? [])
      .map((r: { storage_path: string }) => r.storage_path)
      .filter(Boolean);
    if (paths.length > 0) {
      await admin.storage.from("uploads").remove(paths).catch(() => {});
    }
    await admin.from("uploads").delete().eq("organization_id", orgId);
  }

  // 2. Uploads the user created in shared orgs. delete their rows only
  //    (other members' content stays); storage objects are scoped per upload.
  const sharedOrgIds = orgIds.filter((id) => !personalOrgIds.includes(id));
  if (sharedOrgIds.length > 0) {
    const { data: sharedUploads } = await admin
      .from("uploads")
      .select("id, storage_path")
      .in("organization_id", sharedOrgIds)
      .eq("uploaded_by", user.id);
    const sharedPaths = (sharedUploads ?? [])
      .map((r: { storage_path: string }) => r.storage_path)
      .filter(Boolean);
    if (sharedPaths.length > 0) {
      await admin.storage
        .from("uploads")
        .remove(sharedPaths)
        .catch(() => {});
    }
    const sharedIds = (sharedUploads ?? []).map(
      (r: { id: string }) => r.id,
    );
    if (sharedIds.length > 0) {
      await admin.from("uploads").delete().in("id", sharedIds);
    }
  }

  // 3. Reminders created by user (across all orgs).
  await admin.from("reminders").delete().eq("created_by", user.id);

  // 4. Conversations created by user (cascades messages).
  await admin.from("conversations").delete().eq("created_by", user.id);

  // 5. Custom sections in personal orgs.
  if (personalOrgIds.length > 0) {
    await admin
      .from("custom_sections")
      .delete()
      .in("organization_id", personalOrgIds);
  }

  // 6. Learning events attributed to this user.
  await admin.from("learning_events").delete().eq("actor_id", user.id);

  // 7. Onboarding dismissals. intentionally cleared so hints reappear
  //    after a "start fresh" reset.
  await admin.from("user_onboarding").delete().eq("user_id", user.id);

  // Ops + user-visible audit (system_events is ops; audit_log is the
  // user's own security log on the Settings → Security tab).
  void recordSystemEvent({
    kind: "account.reset",
    severity: "info",
    message: "User reset their account content.",
    actorId: user.id,
  });
  await logAuditEvent({
    userId: user.id,
    action: "account.reset",
    metadata: {
      personal_orgs_wiped: personalOrgIds.length,
      shared_orgs_pruned: sharedOrgIds.length,
    },
  });

  redirect("/dashboard?notice=Your+account+has+been+reset.");
}
