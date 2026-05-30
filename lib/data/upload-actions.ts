"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { runProcessUploadSafely } from "./upload-process-safe";
import { createJob } from "./jobs";
import {
  enrichBuiltinSectionFromMove,
  getOrgSectionContexts,
  pickBestSection,
} from "./section-context";
import { recordLearningEvent } from "./learning";
import { recordSystemEvent } from "./system-events";
import { maybeWritePatternMemoryFromMove } from "./pattern-memories";
import { getCustomSectionById } from "./custom-sections";
import { SECTION_LABEL } from "@/lib/sections-meta";
import { checkDailyUploadBytes, checkTotalUserStorage } from "./quotas";
import { contentHashHex } from "./upload-reuse";
import { logAuditEvent } from "./audit-log";
import { rateLimit, RATE_PRESETS } from "@/lib/rate-limit";
import {
  convertHeicToJpeg,
  heicNameToJpeg,
  isHeicLike,
} from "@/lib/upload/heic";
import { formatBytes } from "@/lib/utils";
import type { Section } from "@/lib/supabase/types";

// Broad allowlist. Anything Oria can store safely goes here; the extractor
// decides whether it can read the contents. For unsupported types we still
// keep the file and let the user search by filename + note.
const ALLOWED_MIME_PREFIXES = ["image/", "audio/", "text/"];
const ALLOWED_MIME_EXACT = [
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Spreadsheets
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  // Presentations
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Common fallbacks
  "application/octet-stream",
  "application/zip",
];
// HEIC/HEIF aren't in either list above because we convert them to JPEG
// in this action before they ever touch storage. isHeicLike() catches
// the case where iOS labels the upload as application/octet-stream.
// Keep below next.config.ts `experimental.serverActions.bodySizeLimit`
// so users see our friendly message instead of a 413 from the framework.
const MAX_BYTES = 50 * 1024 * 1024;

type Result =
  | { ok: true; id: string; warning?: string }
  | { ok: false; error: string };

export async function uploadFile(formData: FormData): Promise<Result> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `File too large. Max ${formatBytes(MAX_BYTES)}` };
  }
  const looksHeic = isHeicLike({ name: file.name, type: file.type });
  const mimeOk =
    looksHeic ||
    ALLOWED_MIME_EXACT.includes(file.type) ||
    ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p));
  if (file.type && !mimeOk) {
    return { ok: false, error: `Unsupported file type: ${file.type}` };
  }

  const ctx = await requireContext();
  const supabase = await createClient();

  // Burst limit so a runaway script or a leaning-on-the-button user can't
  // queue dozens of uploads per second. Per-user, in-process. best-effort
  // but enough at beta scale.
  const burst = rateLimit({
    key: `upload:${ctx.profile.id}`,
    ...RATE_PRESETS.upload(),
  });
  if (!burst.ok) {
    return { ok: false, error: burst.message };
  }

  // Beta safety net: enforce a per-user daily total. Soft-fails open if the
  // check itself errors so a transient DB blip doesn't block a tester.
  const quota = await checkDailyUploadBytes(ctx.profile.id, file.size);
  if (!quota.ok) {
    return { ok: false, error: quota.message };
  }

  // Lifetime storage cap. Stops a single tester from sitting on tens of
  // GB and pushing us over Supabase's plan limit.
  const storage = await checkTotalUserStorage(ctx.profile.id, file.size);
  if (!storage.ok) {
    return { ok: false, error: storage.message };
  }

  // Optional explicit destination hints from the Dropzone caller.
  const sectionHint = String(formData.get("section") ?? "").trim() || null;
  const customSectionId = String(formData.get("custom_section_id") ?? "").trim() || null;

  // Optional free-form note the user typed before picking the file. Stored
  // under metadata.user_description so the extractor can use it as context
  // ("Lunch: chicken, rice, salad" / "Electricity bill for LA") without
  // needing a new column.
  const userDescription =
    String(formData.get("description") ?? "").trim().slice(0, 500) || null;

  // Smart Section routing. When a user uploads through /dashboard/diet or
  // /dashboard/bills, the dropzone tags the upload so the extractor classifies
  // accordingly. Stored in metadata so processUpload (which runs in after())
  // can read it without a second parameter pipeline.
  const smartHintRaw = String(formData.get("smart_section") ?? "").trim();
  const smartSectionHint: "diet" | "bills" | null =
    smartHintRaw === "diet" || smartHintRaw === "bills"
      ? (smartHintRaw as "diet" | "bills")
      : null;

  const uploadId = crypto.randomUUID();

  // iPhone HEIC → JPEG. Convert before storage so signed-URL
  // previews work, Anthropic vision (PNG/JPEG/GIF/WebP only) accepts
  // the file, and the rest of the pipeline treats it as a normal
  // photo. Bytes/name/mime get rewritten in place.
  let bodyBytes: Buffer | File = file;
  let bodyMime = file.type || "application/octet-stream";
  let bodyName = file.name;
  let bodySize = file.size;

  if (looksHeic) {
    // Mark every HEIC attempt unconditionally. so a future "HEIC
    // didn't convert" report has positive evidence the action was
    // even invoked (vs. served by a stale Fluid Compute instance from
    // a prior deploy). Cheap, fire-and-forget.
    void recordSystemEvent({
      kind: "upload.processed",
      severity: "info",
      message: "heic_detected",
      context: {
        stage: "heic_detected",
        filename: file.name,
        mime: file.type,
        size: file.size,
      },
      organizationId: ctx.organization.id,
      actorId: ctx.profile.id,
    });

    try {
      const inputBytes = Buffer.from(await file.arrayBuffer());
      const jpeg = await convertHeicToJpeg(inputBytes);
      if (jpeg.byteLength > MAX_BYTES) {
        return {
          ok: false,
          error: `Photo is too large after conversion. Max ${formatBytes(MAX_BYTES)}.`,
        };
      }
      bodyBytes = jpeg;
      bodyMime = "image/jpeg";
      bodyName = heicNameToJpeg(file.name);
      bodySize = jpeg.byteLength;
      void recordSystemEvent({
        kind: "upload.processed",
        severity: "info",
        message: "heic_converted",
        context: {
          stage: "heic_converted",
          filename: file.name,
          newName: bodyName,
          oldSize: file.size,
          newSize: bodySize,
        },
        organizationId: ctx.organization.id,
        actorId: ctx.profile.id,
      });
    } catch (err) {
      Sentry.captureException(err, {
        tags: { surface: "upload" },
        extra: { stage: "heic_convert", orgId: ctx.organization.id, actorId: ctx.profile.id },
      });
      void recordSystemEvent({
        kind: "upload.failed",
        severity: "error",
        message:
          err instanceof Error ? err.message : "HEIC conversion failed",
        context: {
          stage: "heic_convert",
          filename: file.name,
          size: file.size,
          errorName: err instanceof Error ? err.name : null,
        },
        organizationId: ctx.organization.id,
        actorId: ctx.profile.id,
      });
      return {
        ok: false,
        error: "Couldn't read this iPhone photo. Try sharing it as JPEG instead.",
      };
    }
  }

  const safeName = bodyName.replace(/[^a-zA-Z0-9._-]/g, "_") || "upload";
  const path = `${ctx.organization.id}/${uploadId}/${safeName}`;

  // Materialize to a Buffer so we can (a) fingerprint the content for
  // identical-upload reuse and (b) hand storage a stable body. The File's
  // bytes are already in memory from the multipart parse, so this is a
  // transient copy, not a second read. HEIC already produced a Buffer.
  const buffer: Buffer = Buffer.isBuffer(bodyBytes)
    ? bodyBytes
    : Buffer.from(await file.arrayBuffer());
  // SHA-256 of the bytes Oria actually stores (post-HEIC-conversion). When
  // an identical file is re-uploaded into the same org, processUpload reuses
  // the prior extraction instead of paying Claude again.
  const contentHash = contentHashHex(buffer);

  // 1. Upload bytes to storage.
  const { error: storageError } = await supabase.storage
    .from("uploads")
    .upload(path, buffer, {
      contentType: bodyMime,
      upsert: false,
    });
  if (storageError) {
    Sentry.captureException(new Error(storageError.message), {
      tags: { surface: "upload" },
      extra: { stage: "storage_upload", orgId: ctx.organization.id, uploadId },
    });
    return { ok: false, error: storageError.message };
  }

  // 2. Data-driven classification. The user's hint always wins; otherwise we
  //    score every section in the org against the filename using the section
  //    context layer (no more hardcoded regex ladder).
  let inferredBuiltin: Section | null = null;
  let inferredCustomId: string | null = null;
  if (!sectionHint && !customSectionId) {
    const sections = await getOrgSectionContexts(ctx.organization.id);
    const pick = pickBestSection(bodyName, sections);
    if (pick?.kind === "builtin") inferredBuiltin = pick.key;
    if (pick?.kind === "custom") inferredCustomId = pick.key;
  }

  const finalCustomId = customSectionId ?? inferredCustomId;
  const finalSection = finalCustomId
    ? null
    : (sectionHint as Section | null) ?? inferredBuiltin;

  // Cheap duplicate detection: same org, same filename + size, in the
  // last 24h. We don't block. testers genuinely do re-upload a file
  // after editing it, and we have no content hash to be certain. Just
  // tag metadata so the upload detail can show "Looks like a duplicate
  // of [other]" and emit a status event so the user sees it.
  // Compares against the post-conversion (name, size) so a re-uploaded
  // HEIC still pattern-matches against the previous one.
  const dupCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: dupRows } = await supabase
    .from("uploads")
    .select("id, filename, created_at")
    .eq("organization_id", ctx.organization.id)
    .eq("filename", bodyName)
    .eq("size_bytes", bodySize)
    .is("deleted_at", null)
    .gte("created_at", dupCutoff)
    .order("created_at", { ascending: false })
    .limit(1);
  const dupOf = (dupRows ?? [])[0] as
    | { id: string; filename: string; created_at: string }
    | undefined;

  const { error: dbError } = await supabase.from("uploads").insert({
    id: uploadId,
    organization_id: ctx.organization.id,
    uploaded_by: ctx.profile.id,
    storage_path: path,
    filename: bodyName,
    mime_type: bodyMime || null,
    size_bytes: bodySize,
    section: finalSection,
    custom_section_id: finalCustomId,
    title: bodyName,
    status: "received",
    metadata: {
      content_hash: contentHash,
      ...(userDescription ? { user_description: userDescription } : {}),
      ...(smartSectionHint ? { smart_section_hint: smartSectionHint } : {}),
      ...(dupOf
        ? { duplicate_of: dupOf.id, duplicate_of_at: dupOf.created_at }
        : {}),
    },
  });
  if (dbError) {
    Sentry.captureException(new Error(dbError.message), {
      tags: { surface: "upload" },
      extra: { stage: "db_insert", orgId: ctx.organization.id, uploadId },
    });
    // Best-effort cleanup of orphaned object.
    await supabase.storage.from("uploads").remove([path]).catch(() => {});
    return { ok: false, error: dbError.message };
  }

  // 3. Write a timeline event.
  await supabase.from("timeline_events").insert({
    organization_id: ctx.organization.id,
    actor_id: ctx.profile.id,
    kind: "upload",
    title: bodyName,
    detail: `Uploaded, ${formatBytes(bodySize)}`,
    upload_id: uploadId,
  });

  // 3b. If this looked like a same-day duplicate, surface a calm
  //     "Looks like a duplicate" status event so the user notices
  //     without us blocking the action.
  if (dupOf) {
    void recordSystemEvent({
      kind: "upload.processed",
      severity: "warn",
      message: "Looks like a duplicate of an upload from earlier today.",
      context: {
        uploadId,
        title: bodyName,
        duplicate_of: dupOf.id,
      },
      organizationId: ctx.organization.id,
      actorId: ctx.profile.id,
    });
  }

  // 4. Queue the intelligence pass.
  //    Production: enqueue a pending job and return immediately. the Vercel
  //    cron at /api/cron/process-uploads picks it up every minute with retry
  //    logic. This decouples extraction from the HTTP lifecycle and avoids
  //    hitting the serverless function timeout on large files.
  //    Development: keep running inline via after() so a local cron isn't
  //    needed and the feedback loop stays tight.
  if (process.env.NODE_ENV === "production") {
    await createJob({
      organizationId: ctx.organization.id,
      actorId: ctx.profile.id,
      kind: "upload.extract",
      uploadId,
      context: { uploadId },
    });
  } else {
    after(async () => {
      await runProcessUploadSafely(uploadId, ctx.organization.id);
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard/timeline");

  // Calm, non-blocking storage warning once a user crosses 80% of their
  // lifetime cap. We already passed the hard check above; this just gives
  // a heads-up before they hit the wall. (storage.ok is narrowed true here
  //. the !ok case returned earlier.)
  let warning: string | undefined;
  if (storage.ok) {
    const usedAfter = storage.limit - storage.remaining + bodySize;
    if (usedAfter >= storage.limit * 0.8) {
      warning = `Storage is at ${formatBytes(usedAfter)} of ${formatBytes(storage.limit)}. Delete older uploads soon to stay under your cap.`;
    }
  }
  return { ok: true, id: uploadId, warning };
}


export async function recordUploadOpened(uploadId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("mark_upload_opened", { p_upload_id: uploadId });
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    await logAuditEvent({
      userId: userData.user.id,
      action: "upload.view",
      resourceType: "upload",
      resourceId: uploadId,
    });
  }
}

/**
 * Re-run the AI pipeline for an upload that's stuck or failed. Returns
 * the upload's current state so the caller can revalidate. Idempotent:
 * processUpload itself flips the upload back to status=processing
 * before running, then to filed or failed.
 */
export async function retryUploadProcessing(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const ctx = await requireContext();
  const supabase = await createClient();

  // Scope guard: the user must be in the org that owns this upload.
  const { data: row } = await supabase
    .from("uploads")
    .select("id, organization_id, status")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!row) return;
  const upload = row as {
    id: string;
    organization_id: string;
    status: string | null;
  };

  // Only retry stuck/failed rows. Don't blow up a healthy "filed"
  // record by accident. "received" rows are orphans where the original
  // after() never fired. the retry button is the user's escape hatch.
  if (
    upload.status !== "failed" &&
    upload.status !== "processing" &&
    upload.status !== "received"
  ) {
    return;
  }

  after(async () => {
    await runProcessUploadSafely(upload.id, upload.organization_id);
  });

  revalidatePath(`/dashboard/uploads/${id}`);
  revalidatePath("/dashboard/inbox");
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
    .select(
      "id, uploaded_by, organization_id, section, custom_section_id, filename, title",
    )
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!cur.data) return;

  const row = cur.data as {
    uploaded_by: string | null;
    section: string | null;
    custom_section_id: string | null;
    filename: string;
    title: string | null;
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

  // Closes the learning loop: a move from Unsorted to a built-in section
  // is the strongest "next time, classify like this" signal we get. Add
  // distinctive tokens from the filename/title into that section's
  // per-org keyword context so the classifier picks the same destination
  // on the next similar upload. Per-org, never crosses spaces.
  const wasUnsorted = row.section === null && row.custom_section_id === null;
  if (wasUnsorted && kind === "builtin") {
    void enrichBuiltinSectionFromMove({
      organizationId: ctx.organization.id,
      section: key as Section,
      sourceText: `${row.title ?? ""} ${row.filename}`,
    });
  }

  // Pattern detector: after every move (not just from Unsorted), look
  // for repeats with overlapping tokens and surface a section memory
  // the user can confirm or remove. Best-effort, fully background.
  void (async () => {
    const sourceText = `${row.title ?? ""} ${row.filename}`;
    if (kind === "builtin") {
      await maybeWritePatternMemoryFromMove({
        organizationId: ctx.organization.id,
        destination: { kind: "builtin", section: key },
        sourceText,
        destinationLabel: SECTION_LABEL[key as Section] ?? key,
      });
    } else if (kind === "custom") {
      const cs = await getCustomSectionById(key);
      if (cs) {
        await maybeWritePatternMemoryFromMove({
          organizationId: ctx.organization.id,
          destination: { kind: "custom", customSectionId: key },
          sourceText,
          destinationLabel: cs.name,
        });
      }
    }
  })();

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/uploads/${id}`);
  revalidatePath("/dashboard/sections/review");
}

