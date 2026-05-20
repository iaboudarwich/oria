import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { Profile, Upload } from "@/lib/supabase/types";
import type { UploadWithUploader } from "./uploads";

const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

function expiresAt(deletedAt: string): Date {
  return new Date(new Date(deletedAt).getTime() + RETENTION_MS);
}

export function daysUntilPurge(deletedAt: string, now: Date = new Date()): number {
  const ms = expiresAt(deletedAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Soft-deleted uploads for the user's org, newest deletion first.
 * Items past the 30-day retention have already been purged by purgeExpiredTrash.
 */
export async function listTrashUploads(
  limit = 100,
): Promise<UploadWithUploader[]> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from("uploads")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(limit);

  return attachUploaders((data ?? []) as Upload[]);
}

async function attachUploaders(uploads: Upload[]): Promise<UploadWithUploader[]> {
  if (uploads.length === 0) return [];
  const supabase = await createClient();
  const uploaderIds = Array.from(
    new Set(uploads.map((u) => u.uploaded_by).filter((id): id is string => !!id)),
  );
  const profileMap = new Map<
    string,
    Pick<Profile, "id" | "full_name" | "email">
  >();
  if (uploaderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", uploaderIds);
    (profiles ?? []).forEach((p) => {
      const row = p as Pick<Profile, "id" | "full_name" | "email">;
      profileMap.set(row.id, row);
    });
  }
  return uploads.map((u) => ({
    ...u,
    uploader: u.uploaded_by ? profileMap.get(u.uploaded_by) ?? null : null,
  }));
}

/**
 * Lazy purge: removes uploads whose retention window has elapsed.
 * Called when the user views /dashboard/trash so old items disappear without
 * needing a cron job. Hard-deletes the row and removes the storage object.
 */
export async function purgeExpiredTrash(): Promise<void> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();

  const { data: expired } = await supabase
    .from("uploads")
    .select("id, storage_path")
    .eq("organization_id", ctx.organization.id)
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);

  const rows =
    (expired as { id: string; storage_path: string }[] | null) ?? [];
  if (rows.length === 0) return;

  // Remove storage objects first (best effort), then DB rows.
  const paths = rows.map((r) => r.storage_path);
  await supabase.storage.from("uploads").remove(paths).catch(() => {});
  await supabase
    .from("uploads")
    .delete()
    .in(
      "id",
      rows.map((r) => r.id),
    );
}

