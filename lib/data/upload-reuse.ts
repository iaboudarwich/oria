import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Identical-content reuse — the cheapest extraction is the one we never
 * make.
 *
 * Every upload gets a SHA-256 of its (post-conversion) bytes stamped into
 * metadata.content_hash at upload time. When a new upload's bytes exactly
 * match an already-FILED upload in the SAME organization, we clone that
 * twin's structured records (memory_items + the extractions blob) onto the
 * new upload and skip the Claude extraction call entirely. A re-sent
 * receipt, a forwarded PDF, the same screenshot dropped twice — all now
 * cost zero AI tokens the second time.
 *
 * PRIVACY / SCOPE: the twin lookup is hard-filtered to the new upload's
 * own organization_id. Content hashes never cross an org boundary, so this
 * can't surface one space's records inside another. Cloned rows keep the
 * source organization_id (which equals the new upload's org) and only swap
 * upload_id.
 *
 * The clone is byte-for-byte at the record level: every field the twin's
 * extraction produced (sections, dates, amounts, macros, raw_text) carries
 * over unchanged, because identical bytes would have produced an identical
 * extraction.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** SHA-256 hex digest of the upload's bytes. Stable, collision-safe key. */
export function contentHashHex(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Columns cloned into memory_items — exactly the set buildMemoryItemRows
 *  writes. Kept in sync with lib/data/build-memory-item-rows.ts. */
export const MEMORY_ITEM_CLONE_COLUMNS = [
  "organization_id",
  "upload_id",
  "document_type",
  "section",
  "language",
  "is_handwritten",
  "confidence",
  "title",
  "summary",
  "merchant",
  "amount_value",
  "amount_currency",
  "amount_normalized",
  "occurred_at",
  "location",
  "payment_method",
  "category",
  "items_purchased",
  "raw_text",
  "entities",
  "facts",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "is_recurring",
  "recurring_interval",
  "direction",
  "smart_section",
] as const;

/** Columns cloned into extractions — the set extractionFromAi writes. */
export const EXTRACTION_CLONE_COLUMNS = [
  "upload_id",
  "document_type",
  "language",
  "secondary_languages",
  "is_handwritten",
  "script_hints",
  "raw_text",
  "facts",
  "entities",
  "action_items",
  "confidence",
  "processor",
] as const;

/**
 * Re-stamp cloned rows onto a new upload. Pure: returns fresh objects with
 * upload_id swapped, leaving every other field (including organization_id)
 * untouched. Generic so it works for both memory_items and extractions rows.
 */
export function remapRowsToUpload<T extends { upload_id: string }>(
  rows: T[],
  newUploadId: string,
): T[] {
  return rows.map((row) => ({ ...row, upload_id: newUploadId }));
}

/** Tag a cloned extraction's processor so its provenance is auditable. */
export function markProcessorReused(processor: unknown): string {
  const base = typeof processor === "string" && processor ? processor : "unknown";
  return base.endsWith("+reused") ? base : `${base}+reused`;
}

export type ReuseResult =
  | { reused: false }
  | {
      reused: true;
      twinUploadId: string;
      itemCount: number;
      documentType: string | null;
      language: string | null;
      isHandwritten: boolean;
      title: string | null;
    };

/**
 * Find an already-filed upload in the same org whose bytes match
 * `contentHash` and that actually produced structured records. Returns the
 * oldest such upload (the canonical original) or null. Excludes the upload
 * we're currently processing.
 */
export async function findReusableTwinUpload(
  admin: Admin,
  input: { organizationId: string; contentHash: string; excludeUploadId: string },
): Promise<{ id: string } | null> {
  const { data, error } = await admin
    .from("uploads")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("metadata->>content_hash", input.contentHash)
    .eq("status", "filed")
    .neq("id", input.excludeUploadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return { id: (data[0] as { id: string }).id };
}

/**
 * Clone a twin upload's records onto `newUploadId`, skipping Claude.
 * Returns reused:false when there's nothing safe to clone (the caller then
 * falls back to a normal extraction). All writes are org-scoped via the
 * rows' own organization_id, which equals the new upload's org.
 */
export async function reuseRecordsFromTwin(
  admin: Admin,
  input: {
    newUploadId: string;
    twinUploadId: string;
    organizationId: string;
  },
): Promise<ReuseResult> {
  // 1. Pull the twin's structured items (org-scoped).
  const { data: itemData, error: itemErr } = await admin
    .from("memory_items")
    .select(MEMORY_ITEM_CLONE_COLUMNS.join(","))
    .eq("upload_id", input.twinUploadId)
    .eq("organization_id", input.organizationId);
  // Cast through unknown: the dynamic column-list select can't be
  // narrowed to a typed row by supabase-js's generated types.
  const sourceItems = (itemData ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  // Only reuse when the twin genuinely produced structured records. A twin
  // that only went through the heuristic fallback (no memory_items) gives
  // us nothing worth cloning — fall back to a fresh extraction.
  if (itemErr || sourceItems.length === 0) return { reused: false };

  // 2. Insert cloned items pointed at the new upload.
  const itemRows = remapRowsToUpload(
    sourceItems as Array<{ upload_id: string } & Record<string, unknown>>,
    input.newUploadId,
  );
  const insertItems = await admin
    .from("memory_items")
    .insert(itemRows)
    .select("id");
  if (insertItems.error || (insertItems.data ?? []).length === 0) {
    return { reused: false };
  }

  // 3. Clone the twin's per-file extraction blob (best-effort — the items
  //    are the load-bearing part; the extraction row is the searchable
  //    raw_text mirror).
  const { data: exData } = await admin
    .from("extractions")
    .select(EXTRACTION_CLONE_COLUMNS.join(","))
    .eq("upload_id", input.twinUploadId)
    .limit(1);
  const sourceExtraction = ((exData ?? []) as unknown as Array<
    { upload_id: string; processor?: unknown } & Record<string, unknown>
  >)[0];
  if (sourceExtraction) {
    const cloned = {
      ...remapRowsToUpload([sourceExtraction], input.newUploadId)[0],
      processor: markProcessorReused(sourceExtraction.processor),
    };
    await admin.from("extractions").insert(cloned);
  }

  // 4. Derive the summary fields the upload row mirrors, from the twin.
  const first = sourceItems[0];
  const documentType =
    typeof first.document_type === "string" ? first.document_type : null;
  const language = typeof first.language === "string" ? first.language : null;
  const isHandwritten = sourceItems.some((r) => r.is_handwritten === true);
  const title = typeof first.title === "string" ? first.title : null;

  return {
    reused: true,
    twinUploadId: input.twinUploadId,
    itemCount: sourceItems.length,
    documentType,
    language,
    isHandwritten,
    title,
  };
}
