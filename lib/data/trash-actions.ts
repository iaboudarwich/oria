"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { logAuditEvent } from "./audit-log";

function revalidateAll() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard/timeline");
  revalidatePath("/dashboard/trash");
}

/**
 * Move an upload to trash. Sets deleted_at + deleted_by. The file remains in
 * storage for 30 days and is then hard-deleted (see purgeExpiredTrash).
 *
 * When `redirect_to` is set in the form data we redirect there afterwards.
 * used by the upload detail page, where the row the user just deleted is
 * also the page they're on. When it's absent we stay put: the inline
 * trash button on list rows uses this path so the list re-renders in
 * place via the revalidatePath calls above.
 */
export async function softDeleteUpload(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const redirectTo = String(formData.get("redirect_to") ?? "").trim() || null;

  const ctx = await requireContext();
  const supabase = await createClient();

  await supabase
    .from("uploads")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: ctx.profile.id,
    })
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);

  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "upload.delete",
    resourceType: "upload",
    resourceId: id,
    metadata: { kind: "soft" },
  });

  revalidateAll();
  if (redirectTo) redirect(redirectTo);
}

/** Restore a trashed upload back to its prior section. */
export async function restoreUpload(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const ctx = await requireContext();
  const supabase = await createClient();

  await supabase
    .from("uploads")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);

  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "upload.restore",
    resourceType: "upload",
    resourceId: id,
  });

  revalidateAll();
}

/**
 * Permanently remove an upload: deletes the storage object and the DB row.
 */
export async function permanentlyDeleteUpload(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const ctx = await requireContext();
  const supabase = await createClient();

  // Fetch the path before deleting the row so we can drop the storage object.
  const { data: row } = await supabase
    .from("uploads")
    .select("storage_path")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  const path = (row as { storage_path: string } | null)?.storage_path;

  await supabase
    .from("uploads")
    .delete()
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);

  if (path) {
    await supabase.storage.from("uploads").remove([path]).catch(() => {});
  }

  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "upload.delete",
    resourceType: "upload",
    resourceId: id,
    metadata: { kind: "permanent" },
  });

  revalidateAll();
}
