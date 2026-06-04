"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { logAuditEvent } from "./audit-log";
import { extractUploadGroup } from "./extract-upload-group";

/**
 * Create an upload_group for a multi-image drop. The dropzone calls this once
 * per multi-file action, then stamps each upload with the returned group_id so
 * a single extraction can reason across the whole set. Returns null on failure
 * so the caller falls back to the unchanged per-file path.
 */
export async function createUploadGroup(): Promise<{ groupId: string | null }> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("upload_groups")
    .insert({
      organization_id: ctx.organization.id,
      created_by: ctx.profile.id,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) return { groupId: null };
  const groupId = (data as { id: string }).id;
  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "upload.group_created",
    resourceType: "upload_group",
    resourceId: groupId,
  });
  return { groupId };
}

/**
 * Run the one-shot group extraction once a multi-image set has settled (the
 * dropzone calls this when the last image of a group finishes uploading). The
 * extraction is idempotent via an atomic claim, so the cron fallback and this
 * trigger never double-run. Verifies the group is in the caller's org first.
 */
export async function finalizeUploadGroup(groupId: string): Promise<{ ok: boolean }> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data: group } = await supabase
    .from("upload_groups")
    .select("id, organization_id")
    .eq("id", groupId)
    .maybeSingle();
  if (!group || (group as { organization_id: string }).organization_id !== ctx.organization.id) {
    return { ok: false };
  }
  const res = await extractUploadGroup(groupId);
  if (res.ok) {
    revalidatePath("/dashboard/inbox");
    revalidatePath("/dashboard");
  }
  return { ok: res.ok };
}
