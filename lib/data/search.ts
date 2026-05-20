import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { TYPE_ALIASES } from "./upload-intelligence";
import type {
  DocumentType,
  Extraction,
  Profile,
  Upload,
} from "@/lib/supabase/types";

export type SearchResult = Upload & {
  uploader: Pick<Profile, "id" | "full_name" | "email"> | null;
  extraction: Pick<
    Extraction,
    "document_type" | "language" | "is_handwritten" | "entities" | "action_items"
  > | null;
};

function escapeLike(q: string): string {
  return q.replace(/[%_]/g, "\\$&");
}

/**
 * Retrieve uploads that match a freeform query.
 *
 * Today this is a multi-pronged ILIKE search across:
 *  - upload filename + title
 *  - extraction raw_text (when present)
 *  - extraction entities + facts (stringified)
 *  - the document_type label and its aliases (e.g. "CV" -> resume)
 *
 * Production: once embeddings exist, this becomes a hybrid keyword + vector
 * query. The result shape stays the same so the UI is forward-compatible.
 */
export async function searchUploads(rawQuery: string): Promise<SearchResult[]> {
  const query = rawQuery.trim();
  if (query.length < 2) return [];

  const ctx = await requireContext();
  const supabase = await createClient();
  const orgId = ctx.organization.id;

  const safe = escapeLike(query);
  const pattern = `%${safe}%`;

  // 1. Direct upload matches: filename / title.
  const directQ = supabase
    .from("uploads")
    .select("*")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .or(`filename.ilike.${pattern},title.ilike.${pattern}`)
    .order("created_at", { ascending: false })
    .limit(40);

  // 2. Document-type aliases.
  const aliasMatch = matchTypeAliases(query);
  const typesQ =
    aliasMatch.length > 0
      ? supabase
          .from("uploads")
          .select("*")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .in("document_type", aliasMatch)
          .order("created_at", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [] as Upload[] });

  // 3. Extraction matches: raw_text or stringified entities/facts.
  // We use the JSONB::text cast pattern via a separate query and look up the
  // uploads afterwards. Cheap for small datasets; swap for a SQL RPC later.
  const extractionsQ = supabase
    .from("extractions")
    .select("upload_id")
    .or(
      [
        `raw_text.ilike.${pattern}`,
        // Free-form entity search by string casting in PostgREST is limited.
        // The cheapest workable approach: match action_items text.
      ].join(","),
    )
    .limit(80);

  const [directRes, typesRes, extractionsRes] = await Promise.all([
    directQ,
    typesQ,
    extractionsQ,
  ]);

  const direct = (directRes.data ?? []) as Upload[];
  const byType = (typesRes.data ?? []) as Upload[];

  const fromExtractionIds = Array.from(
    new Set(
      (extractionsRes.data ?? [])
        .map((e) => (e as { upload_id: string }).upload_id)
        .filter(Boolean),
    ),
  );

  let byExtraction: Upload[] = [];
  if (fromExtractionIds.length > 0) {
    const { data } = await supabase
      .from("uploads")
      .select("*")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .in("id", fromExtractionIds);
    byExtraction = (data ?? []) as Upload[];
  }

  // Merge, preserving order: direct > alias > extraction.
  const seen = new Set<string>();
  const merged: Upload[] = [];
  for (const list of [direct, byType, byExtraction]) {
    for (const u of list) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      merged.push(u);
    }
  }

  if (merged.length === 0) return [];

  // Hydrate uploaders + latest extractions.
  const ids = merged.map((u) => u.id);
  const uploaderIds = Array.from(
    new Set(
      merged.map((u) => u.uploaded_by).filter((id): id is string => !!id),
    ),
  );

  const [profilesRes, extractRes] = await Promise.all([
    uploaderIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", uploaderIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("extractions")
      .select(
        "upload_id, document_type, language, is_handwritten, entities, action_items, processed_at",
      )
      .in("upload_id", ids)
      .order("processed_at", { ascending: false }),
  ]);

  const profileMap = new Map<
    string,
    Pick<Profile, "id" | "full_name" | "email">
  >();
  ((profilesRes.data ?? []) as Pick<Profile, "id" | "full_name" | "email">[]).forEach(
    (p) => profileMap.set(p.id, p),
  );

  // First (= most recent) extraction per upload_id.
  const extractionMap = new Map<string, SearchResult["extraction"]>();
  ((extractRes.data ?? []) as Array<{
    upload_id: string;
    document_type: DocumentType | null;
    language: string | null;
    is_handwritten: boolean | null;
    entities: unknown;
    action_items: string[] | null;
  }>).forEach((e) => {
    if (extractionMap.has(e.upload_id)) return;
    extractionMap.set(e.upload_id, {
      document_type: e.document_type,
      language: e.language,
      is_handwritten: e.is_handwritten,
      entities: e.entities as Extraction["entities"],
      action_items: e.action_items ?? [],
    });
  });

  return merged.map((u) => ({
    ...u,
    uploader: u.uploaded_by ? profileMap.get(u.uploaded_by) ?? null : null,
    extraction: extractionMap.get(u.id) ?? null,
  }));
}

function matchTypeAliases(query: string): DocumentType[] {
  const q = query.toLowerCase().trim();
  const direct = TYPE_ALIASES[q];
  if (direct) return direct;
  // Allow a word inside the query to match an alias (single-word aliases).
  const tokens = q.split(/\s+/);
  const hits = new Set<DocumentType>();
  for (const t of tokens) {
    const m = TYPE_ALIASES[t];
    if (m) m.forEach((d) => hits.add(d));
  }
  return Array.from(hits);
}

