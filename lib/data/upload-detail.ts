import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type {
  Extraction,
  MemoryItem,
  Profile,
  Reminder,
  TimelineEvent,
  Upload,
} from "@/lib/supabase/types";

export type ExtractedEntity = {
  id: string;
  upload_id: string;
  organization_id: string;
  doc_type: string;
  confidence: number;
  fields: Record<string, unknown>;
  extracted_at: string;
  extractor_version: string;
  user_verified: boolean;
  user_edited_fields: Record<string, unknown> | null;
};

export type UploadDetail = {
  upload: Upload;
  uploader: Pick<Profile, "id" | "full_name" | "email"> | null;
  lastOpenedBy: Pick<Profile, "id" | "full_name" | "email"> | null;
  signedUrl: string | null;
  reminders: Reminder[];
  events: TimelineEvent[];
  related: Upload[];
  extraction: Extraction | null;
  items: MemoryItem[];
  extractedEntity: ExtractedEntity | null;
};

export async function getUploadDetail(id: string): Promise<UploadDetail | null> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const uploadRes = await supabase
    .from("uploads")
    .select("*")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .maybeSingle();
  const upload = uploadRes.data as Upload | null;
  if (!upload) return null;

  const [
    uploaderRes,
    openedByRes,
    urlRes,
    remindersRes,
    eventsRes,
    relatedRes,
    extractionRes,
    itemsRes,
    entityRes,
  ] = await Promise.all([
    upload.uploaded_by
      ? supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("id", upload.uploaded_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    upload.last_opened_by
      ? supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("id", upload.last_opened_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.storage.from("uploads").createSignedUrl(upload.storage_path, 60 * 10),
    supabase
      .from("reminders")
      .select("*")
      .eq("upload_id", upload.id)
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("timeline_events")
      .select("*")
      .eq("upload_id", upload.id)
      .order("created_at", { ascending: false }),
    relatedUploads(upload),
    supabase
      .from("extractions")
      .select("*")
      .eq("upload_id", upload.id)
      .order("processed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("memory_items")
      .select("*")
      .eq("upload_id", upload.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase.from("extracted_entities").select("*").eq("upload_id", upload.id).maybeSingle(),
  ]);

  return {
    upload,
    uploader: uploaderRes.data as UploadDetail["uploader"],
    lastOpenedBy: openedByRes.data as UploadDetail["lastOpenedBy"],
    signedUrl: urlRes.data?.signedUrl ?? null,
    reminders: (remindersRes.data ?? []) as Reminder[],
    events: (eventsRes.data ?? []) as TimelineEvent[],
    related: relatedRes,
    extraction: (extractionRes.data ?? null) as Extraction | null,
    items: (itemsRes.data ?? []) as MemoryItem[],
    extractedEntity: (entityRes.data ?? null) as ExtractedEntity | null,
  };
}

async function relatedUploads(upload: Upload): Promise<Upload[]> {
  const supabase = await createClient();
  // Same section, same org, recent, excluding the current upload.
  const q = supabase
    .from("uploads")
    .select("*")
    .eq("organization_id", upload.organization_id)
    .is("deleted_at", null)
    .neq("id", upload.id)
    .order("created_at", { ascending: false })
    .limit(5);
  const finalQ = upload.section ? q.eq("section", upload.section) : q;
  const { data } = await finalQ;
  return (data ?? []) as Upload[];
}
