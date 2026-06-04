"use server";

import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { logAuditEvent } from "./audit-log";

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
