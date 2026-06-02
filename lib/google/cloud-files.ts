import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnthropic, getModel } from "@/lib/ai/anthropic";
import { embedViaService } from "@/lib/extraction/service";
import { getFreshCloudAccessToken } from "./token-refresh";
import { driveIndex, driveListFolder, type DriveFileMeta } from "./sidecar";

const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Display-safe linked-file summary. */
export type CloudFileSummary = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  iconLink: string | null;
  thumbnailLink: string | null;
  sizeBytes: number | null;
  modifiedTime: string | null;
  isFolder: boolean;
  accessible: boolean;
  hasSummary: boolean;
};

type Row = {
  id: string;
  name: string;
  mime_type: string;
  web_view_link: string | null;
  icon_link: string | null;
  thumbnail_link: string | null;
  size_bytes: number | null;
  modified_time: string | null;
  is_folder: boolean;
  accessible: boolean;
  content_summary: string | null;
};

const SUMMARY_COLS =
  "id, name, mime_type, web_view_link, icon_link, thumbnail_link, size_bytes, modified_time, is_folder, accessible, content_summary";

function toSummary(r: Row): CloudFileSummary {
  return {
    id: r.id,
    name: r.name,
    mimeType: r.mime_type,
    webViewLink: r.web_view_link,
    iconLink: r.icon_link,
    thumbnailLink: r.thumbnail_link,
    sizeBytes: r.size_bytes,
    modifiedTime: r.modified_time,
    isFolder: r.is_folder,
    accessible: r.accessible,
    hasSummary: !!r.content_summary,
  };
}

/** Files the user has linked into one section of one org (RLS-scoped). */
export async function listCloudFilesForSection(
  userId: string,
  organizationId: string,
  sectionKey: string,
): Promise<CloudFileSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cloud_files")
    .select(SUMMARY_COLS)
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("section_key", sectionKey)
    .order("created_at", { ascending: false });
  return ((data as Row[]) ?? []).map(toSummary);
}

export type PickedFile = {
  id: string; // Drive file id
  name: string;
  mimeType: string;
  url?: string | null;
  iconUrl?: string | null;
  sizeBytes?: number | null;
};

/**
 * Insert rows for the picked files (idempotent on the unique key). Stores only
 * the Picker-supplied reference + metadata, never content. Returns the ids of
 * rows that are new and need indexing.
 */
export async function linkCloudFiles(input: {
  userId: string;
  connectionId: string;
  organizationId: string;
  sectionKey: string;
  files: PickedFile[];
}): Promise<{ linked: number; providerFileIds: string[] }> {
  const admin = createAdminClient();
  const rows = input.files.map((f) => ({
    user_id: input.userId,
    connection_id: input.connectionId,
    organization_id: input.organizationId,
    section_key: input.sectionKey,
    provider_file_id: f.id,
    name: f.name,
    mime_type: f.mimeType,
    web_view_link: f.url ?? null,
    icon_link: f.iconUrl ?? null,
    size_bytes: f.sizeBytes ?? null,
    is_folder: f.mimeType === FOLDER_MIME,
    accessible: true,
  }));
  const { data, error } = await admin
    .from("cloud_files")
    .upsert(rows, { onConflict: "user_id,connection_id,provider_file_id", ignoreDuplicates: false })
    .select("provider_file_id");
  if (error) return { linked: 0, providerFileIds: [] };
  const ids = ((data as { provider_file_id: string }[]) ?? []).map((r) => r.provider_file_id);
  return { linked: ids.length, providerFileIds: ids };
}

/** A one-line retrieval summary of a file's content via Haiku. */
async function summarizeExcerpt(name: string, excerpt: string): Promise<string | null> {
  const anthropic = getAnthropic();
  if (!anthropic || !excerpt.trim()) return null;
  try {
    const msg = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 160,
      messages: [
        {
          role: "user",
          content: `Summarize what this file is about in one or two plain sentences, for later search. No preamble, no markdown.

File name: ${name}
Content excerpt:
${excerpt.slice(0, 4000)}`,
        },
      ],
    });
    const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    return raw || null;
  } catch {
    return null;
  }
}

/**
 * Index the not-yet-summarized files of one connection: fetch metadata + a text
 * excerpt from the sidecar, write a Haiku summary + its embedding, and store the
 * richer metadata. Best-effort; a failure on one file does not block others.
 */
export async function indexConnectionFiles(connectionId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cloud_files")
    .select("provider_file_id")
    .eq("connection_id", connectionId)
    .is("content_summary", null)
    .eq("is_folder", false)
    .eq("accessible", true)
    .limit(50);
  const pending = ((data as { provider_file_id: string }[]) ?? []).map((r) => r.provider_file_id);
  if (pending.length === 0) return 0;

  const token = await getFreshCloudAccessToken(connectionId);
  if (!token) return 0;

  const metas = await driveIndex(token.accessToken, pending);
  let indexed = 0;
  for (const meta of metas) {
    await applyIndexedMeta(connectionId, meta);
    indexed += 1;
  }
  return indexed;
}

/** Persist one file's fetched metadata + summary + embedding. */
async function applyIndexedMeta(connectionId: string, meta: DriveFileMeta): Promise<void> {
  const admin = createAdminClient();
  if (!meta.accessible) {
    await admin
      .from("cloud_files")
      .update({ accessible: false })
      .eq("connection_id", connectionId)
      .eq("provider_file_id", meta.provider_file_id);
    return;
  }

  const summary = await summarizeExcerpt(meta.name, meta.excerpt);
  let embedding: string | null = null;
  if (summary) {
    const vecs = await embedViaService([summary]);
    if (vecs && vecs[0]) embedding = JSON.stringify(vecs[0]);
  }

  await admin
    .from("cloud_files")
    .update({
      name: meta.name,
      mime_type: meta.mime_type,
      web_view_link: meta.web_view_link,
      icon_link: meta.icon_link,
      thumbnail_link: meta.thumbnail_link,
      size_bytes: meta.size_bytes,
      modified_time: meta.modified_time,
      content_summary: summary,
      summary_embedding: embedding,
      last_fetched_at: new Date().toISOString(),
    })
    .eq("connection_id", connectionId)
    .eq("provider_file_id", meta.provider_file_id);
}

/** Connection + provider id + mime for fetch-on-demand (owner-scoped). */
export async function getCloudFileForFetch(
  userId: string,
  fileId: string,
): Promise<{ id: string; connectionId: string; providerFileId: string; mimeType: string; name: string; webViewLink: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cloud_files")
    .select("id, connection_id, provider_file_id, mime_type, name, web_view_link")
    .eq("user_id", userId)
    .eq("id", fileId)
    .maybeSingle();
  if (!data) return null;
  const r = data as {
    id: string;
    connection_id: string;
    provider_file_id: string;
    mime_type: string;
    name: string;
    web_view_link: string | null;
  };
  return {
    id: r.id,
    connectionId: r.connection_id,
    providerFileId: r.provider_file_id,
    mimeType: r.mime_type,
    name: r.name,
    webViewLink: r.web_view_link,
  };
}

/** Mark a linked file inaccessible (after a 403/404 from Drive). */
export async function markCloudFileInaccessible(fileId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("cloud_files").update({ accessible: false }).eq("id", fileId);
}

/** Remove one linked file (owner-scoped). */
export async function unlinkCloudFile(userId: string, fileId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cloud_files")
    .delete()
    .eq("id", fileId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  return !!data;
}

/**
 * For each linked folder, pull its current child files, link any new ones into
 * the same org/section, then index. Idempotent (the unique key prevents
 * duplicates). Returns the number of newly-linked files across all folders.
 */
export async function syncAllLinkedFolders(): Promise<number> {
  const folders = await listLinkedFolders();
  let newlyLinked = 0;
  const touchedConnections = new Set<string>();

  for (const folder of folders) {
    if (!folder.organizationId || !folder.sectionKey) continue;
    const token = await getFreshCloudAccessToken(folder.connectionId);
    if (!token) continue;
    const children = await driveListFolder(token.accessToken, folder.providerFileId);
    if (children.length === 0) continue;
    const { linked } = await linkCloudFiles({
      userId: folder.userId,
      connectionId: folder.connectionId,
      organizationId: folder.organizationId,
      sectionKey: folder.sectionKey,
      files: children.map((c) => ({
        id: c.provider_file_id,
        name: c.name,
        mimeType: c.mime_type,
        url: c.web_view_link,
        iconUrl: c.icon_link,
        sizeBytes: c.size_bytes,
      })),
    });
    newlyLinked += linked;
    touchedConnections.add(folder.connectionId);
  }

  // Index any not-yet-summarized files across the connections we touched.
  for (const connectionId of touchedConnections) {
    await indexConnectionFiles(connectionId);
  }
  return newlyLinked;
}

/** All linked folder rows for the user (for the folder-sync cron). */
export async function listLinkedFolders(): Promise<
  { id: string; userId: string; connectionId: string; organizationId: string | null; sectionKey: string | null; providerFileId: string }[]
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cloud_files")
    .select("id, user_id, connection_id, organization_id, section_key, provider_file_id")
    .eq("is_folder", true)
    .eq("accessible", true);
  return ((data as {
    id: string;
    user_id: string;
    connection_id: string;
    organization_id: string | null;
    section_key: string | null;
    provider_file_id: string;
  }[]) ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    connectionId: r.connection_id,
    organizationId: r.organization_id,
    sectionKey: r.section_key,
    providerFileId: r.provider_file_id,
  }));
}
