import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnthropic, getModel } from "@/lib/ai/anthropic";
import { embedViaService, embedQueryViaService } from "@/lib/extraction/service";
import { getFreshCloudAccessToken } from "./token-refresh";
import { driveIndex, driveListFolder, driveFetch, type DriveFileMeta } from "./sidecar";
import { getFreshMicrosoftCloudToken } from "@/lib/microsoft/token-refresh";
import { onedriveIndex, onedriveFetch } from "@/lib/microsoft/sidecar";
import { kvGet, kvSet } from "@/lib/cache/kv";

/** Provider of one cloud connection (defaults to google for legacy rows). */
async function connectionProvider(connectionId: string): Promise<"google" | "microsoft"> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cloud_connections")
    .select("provider")
    .eq("id", connectionId)
    .maybeSingle();
  return (data as { provider?: string } | null)?.provider === "microsoft" ? "microsoft" : "google";
}

/** Fresh access token for a connection, by provider. */
async function freshAccessToken(
  connectionId: string,
  provider: "google" | "microsoft",
): Promise<string | null> {
  if (provider === "microsoft") {
    const t = await getFreshMicrosoftCloudToken(connectionId);
    return t?.accessToken ?? null;
  }
  const t = await getFreshCloudAccessToken(connectionId);
  return t?.accessToken ?? null;
}

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
  provider: "google" | "microsoft";
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
  cloud_connections: { provider: string } | { provider: string }[] | null;
};

const SUMMARY_COLS =
  "id, name, mime_type, web_view_link, icon_link, thumbnail_link, size_bytes, modified_time, is_folder, accessible, content_summary, cloud_connections(provider)";

function toSummary(r: Row): CloudFileSummary {
  const conn = Array.isArray(r.cloud_connections) ? r.cloud_connections[0] : r.cloud_connections;
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
    provider: conn?.provider === "microsoft" ? "microsoft" : "google",
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

  const provider = await connectionProvider(connectionId);
  const accessToken = await freshAccessToken(connectionId, provider);
  if (!accessToken) return 0;

  const metas =
    provider === "microsoft"
      ? await onedriveIndex(accessToken, pending)
      : await driveIndex(accessToken, pending);
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
): Promise<{
  id: string;
  connectionId: string;
  providerFileId: string;
  mimeType: string;
  name: string;
  webViewLink: string | null;
  modifiedTime: string | null;
} | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cloud_files")
    .select("id, connection_id, provider_file_id, mime_type, name, web_view_link, modified_time")
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
    modified_time: string | null;
  };
  return {
    id: r.id,
    connectionId: r.connection_id,
    providerFileId: r.provider_file_id,
    mimeType: r.mime_type,
    name: r.name,
    webViewLink: r.web_view_link,
    modifiedTime: r.modified_time,
  };
}

export type CloudFileMatch = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  contentSummary: string | null;
  connectionId: string;
  providerFileId: string;
  similarity: number;
};

/** Semantic search over linked Drive files in one org (for Ask Oria). */
export async function searchCloudFiles(
  organizationId: string,
  query: string,
  topK = 6,
  similarityThreshold = 0.3,
): Promise<CloudFileMatch[]> {
  const embedding = await embedQueryViaService(query);
  if (!embedding || embedding.length !== 384) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_cloud_files", {
    query_embedding: JSON.stringify(embedding),
    match_org_id: organizationId,
    match_count: topK,
    similarity_threshold: similarityThreshold,
  });
  if (error || !data) return [];
  return (data as Array<{
    id: string;
    name: string;
    mime_type: string;
    web_view_link: string | null;
    content_summary: string | null;
    connection_id: string;
    provider_file_id: string;
    similarity: number;
  }>).map((r) => ({
    id: r.id,
    name: r.name,
    mimeType: r.mime_type,
    webViewLink: r.web_view_link,
    contentSummary: r.content_summary,
    connectionId: r.connection_id,
    providerFileId: r.provider_file_id,
    similarity: r.similarity,
  }));
}

export type CloudFileContent = {
  status: "ok" | "inaccessible" | "unavailable" | "not_found";
  text?: string;
  name?: string;
  webViewLink?: string | null;
};

/**
 * Fetch-on-demand content for one linked file. Caches the parsed text in Redis
 * for 5 minutes (keyed on provider id + modified time, so a source edit
 * invalidates it). Never persists content to the database. On a 403/404 from
 * Drive the file is flagged inaccessible.
 */
export async function fetchCloudFileContent(
  userId: string,
  fileId: string,
): Promise<CloudFileContent> {
  const file = await getCloudFileForFetch(userId, fileId);
  if (!file) return { status: "not_found" };

  const cacheKey = `cloudcontent:${file.providerFileId}:${file.modifiedTime ?? "x"}`;
  const cached = await kvGet(cacheKey);
  if (cached !== null) {
    return { status: "ok", text: cached, name: file.name, webViewLink: file.webViewLink };
  }

  const provider = await connectionProvider(file.connectionId);
  const accessToken = await freshAccessToken(file.connectionId, provider);
  if (!accessToken) return { status: "unavailable" };

  const result =
    provider === "microsoft"
      ? await onedriveFetch(accessToken, file.providerFileId, file.mimeType)
      : await driveFetch(accessToken, file.providerFileId, file.mimeType);
  if (!result) return { status: "unavailable" };
  if (!result.accessible) {
    await markCloudFileInaccessible(file.id);
    return { status: "inaccessible", name: file.name, webViewLink: file.webViewLink };
  }

  await kvSet(cacheKey, result.text, 300); // 5-minute TTL
  const admin = createAdminClient();
  await admin
    .from("cloud_files")
    .update({ last_fetched_at: new Date().toISOString() })
    .eq("id", file.id);

  return { status: "ok", text: result.text, name: file.name, webViewLink: file.webViewLink };
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
