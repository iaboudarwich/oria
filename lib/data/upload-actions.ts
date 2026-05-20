"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { processUpload } from "./upload-intelligence";
import { getOrgSectionContexts, pickBestSection } from "./section-context";
import { recordLearningEvent } from "./learning";
import { formatBytes } from "@/lib/utils";
import type { Section } from "@/lib/supabase/types";

const ALLOWED_MIME_PREFIXES = ["image/", "audio/"];
const ALLOWED_MIME_EXACT = [
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
// Keep below next.config.ts `experimental.serverActions.bodySizeLimit`
// so users see our friendly message instead of a 413 from the framework.
const MAX_BYTES = 25 * 1024 * 1024;

type Result = { ok: true; id: string } | { ok: false; error: string };

export async function uploadFile(formData: FormData): Promise<Result> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `File too large. Max ${formatBytes(MAX_BYTES)}` };
  }
  const mimeOk =
    ALLOWED_MIME_EXACT.includes(file.type) ||
    ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p));
  if (file.type && !mimeOk) {
    return { ok: false, error: `Unsupported file type: ${file.type}` };
  }

  const ctx = await requireContext();
  const supabase = await createClient();

  // Optional explicit destination hints from the Dropzone caller.
  const sectionHint = String(formData.get("section") ?? "").trim() || null;
  const customSectionId = String(formData.get("custom_section_id") ?? "").trim() || null;

  // Optional free-form note the user typed before picking the file. Stored
  // under metadata.user_description so the extractor can use it as context
  // ("Lunch: chicken, rice, salad" / "Electricity bill for LA") without
  // needing a new column.
  const userDescription =
    String(formData.get("description") ?? "").trim().slice(0, 500) || null;

  const uploadId = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "upload";
  const path = `${ctx.organization.id}/${uploadId}/${safeName}`;

  // 1. Upload bytes to storage.
  const { error: storageError } = await supabase.storage
    .from("uploads")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (storageError) {
    return { ok: false, error: storageError.message };
  }

  // 2. Data-driven classification. The user's hint always wins; otherwise we
  //    score every section in the org against the filename using the section
  //    context layer (no more hardcoded regex ladder).
  let inferredBuiltin: Section | null = null;
  let inferredCustomId: string | null = null;
  if (!sectionHint && !customSectionId) {
    const sections = await getOrgSectionContexts(ctx.organization.id);
    const pick = pickBestSection(file.name, sections);
    if (pick?.kind === "builtin") inferredBuiltin = pick.key;
    if (pick?.kind === "custom") inferredCustomId = pick.key;
  }

  const finalCustomId = customSectionId ?? inferredCustomId;
  const finalSection = finalCustomId
    ? null
    : (sectionHint as Section | null) ?? inferredBuiltin;

  const { error: dbError } = await supabase.from("uploads").insert({
    id: uploadId,
    organization_id: ctx.organization.id,
    uploaded_by: ctx.profile.id,
    storage_path: path,
    filename: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    section: finalSection,
    custom_section_id: finalCustomId,
    title: file.name,
    status: "received",
    metadata: userDescription ? { user_description: userDescription } : {},
  });
  if (dbError) {
    // Best-effort cleanup of orphaned object.
    await supabase.storage.from("uploads").remove([path]).catch(() => {});
    return { ok: false, error: dbError.message };
  }

  // 3. Write a timeline event.
  await supabase.from("timeline_events").insert({
    organization_id: ctx.organization.id,
    actor_id: ctx.profile.id,
    kind: "upload",
    title: file.name,
    detail: `Uploaded, ${formatBytes(file.size)}`,
    upload_id: uploadId,
  });

  // 4. Run the intelligence pass AFTER the response is sent so the upload
  //    action returns immediately. Claude reads the file in the background;
  //    Ask Oria already surfaces in-flight uploads as PENDING with a
  //    "Reading…" chip, so the rest of the UI stays snappy.
  after(async () => {
    await processUpload(uploadId).catch(() => {});
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard/timeline");
  return { ok: true, id: uploadId };
}

export async function recordUploadOpened(uploadId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("mark_upload_opened", { p_upload_id: uploadId });
}

const BUILTIN_SECTIONS = new Set([
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
]);

/**
 * Move an upload to a different section. Accepts one of:
 *   - target_kind=builtin, target_key=<section enum>
 *   - target_kind=custom, target_key=<custom_section_id uuid>
 *   - target_kind=review (clears both, sends back to Review)
 *
 * Owner or uploader of the file. RLS enforces the rest.
 */
export async function setUploadSection(formData: FormData): Promise<void> {
  const id = String(formData.get("upload_id") ?? "").trim();
  const kind = String(formData.get("target_kind") ?? "").trim();
  const key = String(formData.get("target_key") ?? "").trim();
  if (!id || !kind) return;

  const ctx = await requireContext();
  const supabase = await createClient();

  // Confirm the upload is in the active org so the cross-org safety net holds
  // even before RLS runs.
  const cur = await supabase
    .from("uploads")
    .select("id, uploaded_by, organization_id, section, custom_section_id")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!cur.data) return;

  const row = cur.data as {
    uploaded_by: string | null;
    section: string | null;
    custom_section_id: string | null;
  };
  const isOwner = ctx.membership.role === "owner";
  const isUploader = row.uploaded_by === ctx.profile.id;
  if (!isOwner && !isUploader) return;

  let update: { section: string | null; custom_section_id: string | null };
  if (kind === "builtin") {
    if (!BUILTIN_SECTIONS.has(key)) return;
    update = { section: key, custom_section_id: null };
  } else if (kind === "custom") {
    if (!key) return;
    update = { section: null, custom_section_id: key };
  } else if (kind === "review") {
    update = { section: null, custom_section_id: null };
  } else {
    return;
  }

  await supabase
    .from("uploads")
    .update(update)
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);

  // Learning signal: a manual move is the strongest correction signal we
  // get. Fire-and-forget; never blocks the user.
  void recordLearningEvent({
    organizationId: ctx.organization.id,
    actorId: ctx.profile.id,
    kind: "upload.moved",
    payload: {
      upload_id: id,
      from: {
        section: row.section,
        custom_section_id: row.custom_section_id,
      },
      to: update,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/uploads/${id}`);
  revalidatePath("/dashboard/sections/review");
}

