import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { getSignedUrlMap } from "./uploads";
import type { Section, UploadGroupStatus } from "@/lib/supabase/types";

export type GroupReviewImage = {
  uploadId: string;
  filename: string;
  thumbUrl: string | null;
};

export type GroupReviewRecord = {
  id: string;
  title: string;
  section: Section | null;
  summary: string | null;
};

export type GroupReview = {
  groupId: string;
  /** "merged" = one record (offer Split). "split" = several (offer Merge). */
  status: Extract<UploadGroupStatus, "merged" | "split">;
  images: GroupReviewImage[];
  records: GroupReviewRecord[];
  createdAt: string;
};

/**
 * Groups the user has not yet reviewed: a multi-image drop that Oria read as one
 * set (merged) or as several (split). Each carries its member thumbnails and the
 * resulting record(s) so the review strip can show the call and let the user
 * confirm it or flip it. Only finished groups (merged/split) surface here, never
 * ones still pending/extracting.
 */
export async function listReviewableGroups(limit = 8): Promise<GroupReview[]> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const { data: groups } = await supabase
    .from("upload_groups")
    .select("id, status, created_at")
    .eq("organization_id", ctx.organization.id)
    .is("reviewed_at", null)
    .in("status", ["merged", "split"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!groups || groups.length === 0) return [];

  const groupIds = (groups as { id: string }[]).map((g) => g.id);

  // Member images and resulting records for the whole batch in two queries.
  const [{ data: members }, { data: records }] = await Promise.all([
    supabase
      .from("uploads")
      .select("id, filename, storage_path, group_id")
      .in("group_id", groupIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("memory_items")
      .select("id, title, section, summary, group_id")
      .in("group_id", groupIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const memberRows = (members ?? []) as {
    id: string;
    filename: string;
    storage_path: string;
    group_id: string;
  }[];
  const thumbs = await getSignedUrlMap(
    memberRows.map((m) => ({ id: m.id, storage_path: m.storage_path })),
  );

  const recordRows = (records ?? []) as {
    id: string;
    title: string;
    section: Section | null;
    summary: string | null;
    group_id: string;
  }[];

  return (groups as { id: string; status: GroupReview["status"]; created_at: string }[]).map(
    (g) => ({
      groupId: g.id,
      status: g.status,
      createdAt: g.created_at,
      images: memberRows
        .filter((m) => m.group_id === g.id)
        .map((m) => ({
          uploadId: m.id,
          filename: m.filename,
          thumbUrl: thumbs.get(m.id) ?? null,
        })),
      records: recordRows
        .filter((r) => r.group_id === g.id)
        .map((r) => ({
          id: r.id,
          title: r.title,
          section: r.section,
          summary: r.summary,
        })),
    }),
  );
}
