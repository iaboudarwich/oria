import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { enforceActiveOrg } from "./scope";
import type { Profile, Section, Upload } from "@/lib/supabase/types";

export type UploadWithUploader = Upload & {
  uploader: Pick<Profile, "id" | "full_name" | "email"> | null;
};

/**
 * Recent uploads with each one's uploader profile attached.
 * Uses two queries to avoid PostgREST relation inference quirks.
 */
export async function listUploadsWithUploader(
  opts: {
    section?: Section;
    limit?: number;
  } = {},
): Promise<UploadWithUploader[]> {
  const { section, limit = 20 } = opts;
  const ctx = await requireContext();
  const supabase = await createClient();

  let q = supabase
    .from("uploads")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (section) q = q.eq("section", section);

  const { data, error } = await q;
  if (error || !data) return [];
  const uploads = enforceActiveOrg(
    data as Upload[],
    ctx.organization.id,
    "listUploadsWithUploader",
  );

  const uploaderIds = Array.from(
    new Set(uploads.map((u) => u.uploaded_by).filter((id): id is string => !!id)),
  );

  const profileMap = new Map<string, Pick<Profile, "id" | "full_name" | "email">>();
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
    uploader: u.uploaded_by ? (profileMap.get(u.uploaded_by) ?? null) : null,
  }));
}

const SECTION_KEYS: Section[] = [
  "household",
  "travel",
  "properties",
  "staff",
  "events",
  "finance",
  "legal",
  "personal",
  "vendors",
  "health",
];

/**
 * Per-section upload counts. Issues one head-only COUNT(*) per section in
 * parallel rather than fetching every row and counting in memory. same
 * answer, no payload, scales to large orgs.
 */
export async function countUploadsBySection(): Promise<Record<Section, number>> {
  const ctx = await requireContext();
  const supabase = await createClient();

  // One query instead of one-per-section (was 10 round trips on the dashboard
  // home and inbox). Pull just the section column for the org's live uploads
  // and tally in memory; the section column is tiny and indexed.
  const counts = Object.fromEntries(SECTION_KEYS.map((s) => [s, 0])) as Record<Section, number>;

  const { data } = await supabase
    .from("uploads")
    .select("section")
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .not("section", "is", null);

  for (const row of (data ?? []) as Array<{ section: Section | null }>) {
    if (row.section && row.section in counts) counts[row.section] += 1;
  }

  return counts;
}

/**
 * Batch-fetch signed URLs for a set of upload paths. Returns a map keyed by
 * upload id. Used to render small thumbnails inline in lists.
 */
export async function getSignedUrlMap(
  uploads: { id: string; storage_path: string }[],
  expiresIn = 60 * 10,
): Promise<Map<string, string>> {
  if (uploads.length === 0) return new Map();
  const supabase = await createClient();
  const paths = uploads.map((u) => u.storage_path);
  const { data } = await supabase.storage.from("uploads").createSignedUrls(paths, expiresIn);
  const map = new Map<string, string>();
  if (!data) return map;
  data.forEach((d, i) => {
    if (d.signedUrl) map.set(uploads[i].id, d.signedUrl);
  });
  return map;
}
