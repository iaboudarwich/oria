"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { logAuditEvent } from "./audit-log";
import { extractUploadGroup } from "./extract-upload-group";
import { createJob } from "./jobs";
import type { UploadGroupStatus } from "@/lib/supabase/types";

type OwnedGroup = { id: string; status: UploadGroupStatus };

/** Load a group only if it belongs to the caller's active org. Returns null
 *  otherwise so an action can refuse cross-org access. */
async function loadOwnedGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  orgId: string,
): Promise<OwnedGroup | null> {
  const { data } = await supabase
    .from("upload_groups")
    .select("id, status, organization_id")
    .eq("id", groupId)
    .maybeSingle();
  if (!data || (data as { organization_id: string }).organization_id !== orgId) return null;
  return { id: (data as { id: string }).id, status: (data as { status: UploadGroupStatus }).status };
}

function revalidateUploads() {
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard");
}

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
  if (res.ok) revalidateUploads();
  return { ok: res.ok };
}

/**
 * The user agrees with how Oria read a multi-image set (one record or several).
 * Stamp it reviewed so it drops out of the review strip; the records stay as is.
 */
export async function confirmUploadGroup(groupId: string): Promise<{ ok: boolean }> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const group = await loadOwnedGroup(supabase, groupId, ctx.organization.id);
  if (!group) return { ok: false };

  await supabase
    .from("upload_groups")
    .update({ reviewed_at: new Date().toISOString() })
    .eq("id", groupId);
  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "upload.group_confirmed",
    resourceType: "upload_group",
    resourceId: groupId,
    metadata: { status: group.status },
  });
  revalidateUploads();
  return { ok: true };
}

/**
 * Oria merged a set that is really several distinct things. Tear the merged
 * record down and let each image go through the normal per-file pipeline again.
 */
export async function splitUploadGroup(groupId: string): Promise<{ ok: boolean }> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const group = await loadOwnedGroup(supabase, groupId, ctx.organization.id);
  if (!group) return { ok: false };
  const nowIso = new Date().toISOString();

  // Supersede the merged record(s) and their extracted fields.
  await supabase
    .from("memory_items")
    .update({ deleted_at: nowIso, deleted_by: ctx.profile.id })
    .eq("group_id", groupId)
    .is("deleted_at", null);
  await supabase.from("extracted_entities").delete().eq("group_id", groupId);

  // Detach each member and re-queue it for its own extraction.
  const { data: members } = await supabase
    .from("uploads")
    .select("id, metadata")
    .eq("group_id", groupId)
    .is("deleted_at", null);
  for (const m of (members ?? []) as { id: string; metadata: Record<string, unknown> | null }[]) {
    const meta = { ...(m.metadata ?? {}) };
    delete meta.grouped_child;
    delete meta.grouped_into;
    await supabase
      .from("uploads")
      .update({ group_id: null, status: "received", section: null, metadata: meta })
      .eq("id", m.id);
    await createJob({
      organizationId: ctx.organization.id,
      actorId: ctx.profile.id,
      kind: "upload.extract",
      uploadId: m.id,
      context: { uploadId: m.id, from_group: groupId, reason: "user_split" },
    }).catch(() => {});
  }

  await supabase
    .from("upload_groups")
    .update({ status: "split", reviewed_at: nowIso })
    .eq("id", groupId);
  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "upload.group_split",
    resourceType: "upload_group",
    resourceId: groupId,
    metadata: { members: (members ?? []).length },
  });
  revalidateUploads();
  return { ok: true };
}

/**
 * Oria split a set that is really one thing. Drop the separate records and read
 * the whole set again as one (force_merge), leaving a single merged record the
 * user can then confirm.
 */
export async function mergeUploadGroup(groupId: string): Promise<{ ok: boolean }> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const group = await loadOwnedGroup(supabase, groupId, ctx.organization.id);
  if (!group) return { ok: false };
  const nowIso = new Date().toISOString();

  // Supersede the separate records and their extracted fields.
  await supabase
    .from("memory_items")
    .update({ deleted_at: nowIso, deleted_by: ctx.profile.id })
    .eq("group_id", groupId)
    .is("deleted_at", null);
  await supabase.from("extracted_entities").delete().eq("group_id", groupId);

  // Clear any folded-child marks so every member is read fresh.
  const { data: members } = await supabase
    .from("uploads")
    .select("id, metadata")
    .eq("group_id", groupId)
    .is("deleted_at", null);
  for (const m of (members ?? []) as { id: string; metadata: Record<string, unknown> | null }[]) {
    const meta = { ...(m.metadata ?? {}) };
    delete meta.grouped_child;
    delete meta.grouped_into;
    await supabase.from("uploads").update({ status: "received", metadata: meta }).eq("id", m.id);
  }

  // Reset the group to pending with force_merge, then re-read it as one set.
  await supabase
    .from("upload_groups")
    .update({ status: "pending", force_merge: true, reviewed_at: null })
    .eq("id", groupId);

  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "upload.group_merged",
    resourceType: "upload_group",
    resourceId: groupId,
    metadata: { members: (members ?? []).length },
  });

  const res = await extractUploadGroup(groupId);
  revalidateUploads();
  return { ok: res.ok };
}
