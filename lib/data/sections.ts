import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { Profile, Upload } from "@/lib/supabase/types";
import type { UploadWithUploader } from "./uploads";

/**
 * Uploads Oria couldn't confidently classify: no built-in section,
 * no custom section, or marked as document_type='unknown'.
 */
export async function listReviewUploads(
  limit = 50,
): Promise<UploadWithUploader[]> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from("uploads")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .or("section.is.null,document_type.eq.unknown")
    .is("custom_section_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return attachUploaders((data ?? []) as Upload[]);
}

export async function listUploadsForCustomSection(
  customSectionId: string,
  limit = 100,
): Promise<UploadWithUploader[]> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from("uploads")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .eq("custom_section_id", customSectionId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
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
 * Count uploads currently in review (no section, no custom section, or unknown).
 */
export async function countReviewUploads(): Promise<number> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { count } = await supabase
    .from("uploads")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .or("section.is.null,document_type.eq.unknown")
    .is("custom_section_id", null);
  return count ?? 0;
}
