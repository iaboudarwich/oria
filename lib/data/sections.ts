import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { Profile, Section, Upload } from "@/lib/supabase/types";
import type { UploadWithUploader } from "./uploads";

/**
 * A row that shows up on a section page. Two flavours:
 *   • kind: "upload" — a whole file the user filed into this section. This
 *     includes multi-item uploads whose items all landed in the same
 *     section (their parent upload was propagated here).
 *   • kind: "item"   — one receipt extracted from a multi-item file whose
 *     other items went elsewhere. The parent upload lives in the Uploads
 *     archive (/dashboard/inbox), not in any specific section.
 *
 * Both link back to /dashboard/uploads/{upload_id} so the user can see the
 * source file and re-sort if needed.
 */
export type SectionEntry =
  | {
      kind: "upload";
      id: string;
      upload_id: string;
      filename: string;
      title: string | null;
      mime_type: string | null;
      storage_path: string;
      document_type: string | null;
      created_at: string;
      uploader: Pick<Profile, "id" | "full_name" | "email"> | null;
    }
  | {
      kind: "item";
      id: string;
      upload_id: string;
      filename: string; // parent upload's filename, for thumbnail
      title: string;
      mime_type: string | null;
      storage_path: string;
      created_at: string;
      merchant: string | null;
      amount_value: string | null;
      amount_currency: string | null;
      occurred_at: string | null;
    };

/**
 * Uploads Oria couldn't confidently classify: no built-in section,
 * no custom section, or marked as document_type='unknown'.
 *
 * Multi-item uploads whose items have all been sorted are stamped with
 * `metadata.items_sorted_at` by propagateUploadSectionFromItems and
 * filtered out here — the source file still lives in the Uploads archive
 * (/dashboard/inbox), it just no longer needs review.
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
    .is("metadata->>items_sorted_at", null)
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
 * Combined view of a section: filed uploads plus orphan items whose
 * parent upload lives elsewhere (split-destination multi-item uploads).
 * Sorted newest-first across both kinds.
 */
export async function listSectionEntries(
  ref: { kind: "builtin"; key: Section } | { kind: "custom"; key: string },
  limit = 100,
): Promise<SectionEntry[]> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const uploads =
    ref.kind === "builtin"
      ? await listUploadsByBuiltin(ref.key, limit)
      : await listUploadsByCustom(ref.key, limit);

  // Items whose section matches AND whose parent upload's section doesn't
  // (so we don't double-show single-item or fully-propagated uploads).
  const knownUploadIds = new Set(uploads.map((u) => u.id));

  let itemsQ = supabase
    .from("memory_items")
    .select(
      "id, upload_id, title, merchant, amount_value, amount_currency, occurred_at, created_at, uploads(filename, mime_type, storage_path, section, custom_section_id)",
    )
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .not("upload_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (ref.kind === "builtin") itemsQ = itemsQ.eq("section", ref.key);
  else itemsQ = itemsQ.eq("custom_section_id", ref.key);

  const itemsRes = await itemsQ;

  type ItemJoinRow = {
    id: string;
    upload_id: string;
    title: string;
    merchant: string | null;
    amount_value: string | null;
    amount_currency: string | null;
    occurred_at: string | null;
    created_at: string;
    uploads:
      | Array<{
          filename: string;
          mime_type: string | null;
          storage_path: string;
          section: Section | null;
          custom_section_id: string | null;
        }>
      | {
          filename: string;
          mime_type: string | null;
          storage_path: string;
          section: Section | null;
          custom_section_id: string | null;
        }
      | null;
  };

  const orphanItems: SectionEntry[] = [];
  for (const r of (itemsRes.data ?? []) as ItemJoinRow[]) {
    const u = Array.isArray(r.uploads) ? r.uploads[0] : r.uploads;
    if (!u) continue;
    // Skip items whose parent upload is already shown in this section.
    if (knownUploadIds.has(r.upload_id)) continue;
    // Belt and braces: only count as "orphan" if the parent upload's own
    // section doesn't match this section.
    const parentMatches =
      ref.kind === "builtin"
        ? u.section === ref.key
        : u.custom_section_id === ref.key;
    if (parentMatches) continue;
    orphanItems.push({
      kind: "item",
      id: r.id,
      upload_id: r.upload_id,
      filename: u.filename,
      title: r.title,
      mime_type: u.mime_type,
      storage_path: u.storage_path,
      created_at: r.created_at,
      merchant: r.merchant,
      amount_value: r.amount_value,
      amount_currency: r.amount_currency,
      occurred_at: r.occurred_at,
    });
  }

  const uploadEntries: SectionEntry[] = uploads.map((u) => ({
    kind: "upload",
    id: u.id,
    upload_id: u.id,
    filename: u.filename,
    title: u.title,
    mime_type: u.mime_type,
    storage_path: u.storage_path,
    document_type: u.document_type ?? null,
    created_at: u.created_at,
    uploader: u.uploader,
  }));

  return [...uploadEntries, ...orphanItems]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, limit);
}

async function listUploadsByBuiltin(
  section: Section,
  limit: number,
): Promise<UploadWithUploader[]> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("uploads")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .eq("section", section)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  return attachUploaders((data ?? []) as Upload[]);
}

async function listUploadsByCustom(
  customSectionId: string,
  limit: number,
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

/**
 * Count uploads currently in review (no section, no custom section, or
 * unknown). Same items_sorted_at filter as listReviewUploads so the
 * sidebar badge agrees with the page contents.
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
    .is("custom_section_id", null)
    .is("metadata->>items_sorted_at", null);
  return count ?? 0;
}
