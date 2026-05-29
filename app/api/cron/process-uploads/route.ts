import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  claimPendingExtractionJobs,
  claimPendingEntityJobs,
  claimPendingImageJobs,
  claimPendingCategorizationJobs,
  createJob,
  markJobCompleted,
  markJobFailed,
  requeueJobForRetry,
} from "@/lib/data/jobs";
import { processUpload } from "@/lib/data/upload-intelligence";
import { extractEntity } from "@/lib/ai/extract-entities";
import { runImageAnalysis } from "@/lib/ai/run-image-analysis";
import { runCategorizeSection } from "@/lib/ai/run-categorize-section";
import { runDetectTrackable } from "@/lib/ai/run-detect-trackable";
import { recordSystemEvent } from "@/lib/data/system-events";

/** Maximum concurrent jobs per phase per cron tick. */
const BATCH_SIZE = 3;
/** Give up permanently after this many total attempts (initial + retries). */
const MAX_RETRIES = 3;

/**
 * GET /api/cron/process-uploads
 *
 * Called by Vercel Cron every minute (see vercel.json). Two phases:
 *
 * Phase A — upload.extract: text extraction + embedding (existing pipeline).
 *   On success, enqueues an entity.extract job for the same upload.
 *
 * Phase B — entity.extract: structured field extraction via two Haiku calls.
 *   Processed after Phase A in the same cron tick so extraction happens
 *   one minute after upload completes (no new cron entry needed).
 *
 * Auth: Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Phase A: upload.extract ───────────────────────────────────────────────
  const extractJobs = await claimPendingExtractionJobs(BATCH_SIZE);

  const extractResults = await Promise.allSettled(
    extractJobs.map(async (job) => {
      if (!job.upload_id) {
        await markJobFailed(job.id, "Missing upload_id on job row");
        return { id: job.id, ok: false };
      }

      try {
        await processUpload(job.upload_id);
        await markJobCompleted(job.id);

        // Determine follow-up job based on MIME type.
        // Images use Phase C (vision analysis) which does both
        // classification and extraction in one call.
        // Other files use Phase B (entity.extract).
        const { data: uploadRow } = await createAdminClient()
          .from("uploads")
          .select("mime_type")
          .eq("id", job.upload_id)
          .maybeSingle();
        const mime = (uploadRow as { mime_type?: string } | null)?.mime_type ?? "";
        const nextKind = mime.startsWith("image/")
          ? ("analyze_image" as const)
          : ("entity.extract" as const);

        await createJob({
          organizationId: job.organization_id,
          actorId: job.actor_id,
          kind: nextKind,
          uploadId: job.upload_id,
        }).catch(() => {});

        return { id: job.id, ok: true };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Cron extraction failed";

        if (job.retry_count < MAX_RETRIES) {
          await requeueJobForRetry(job.id, message, job.retry_count);
        } else {
          await markJobFailed(job.id, message);
          try {
            const admin = createAdminClient();
            await admin
              .from("uploads")
              .update({ status: "failed" })
              .eq("id", job.upload_id);
            void recordSystemEvent({
              kind: "upload.failed",
              severity: "error",
              message,
              context: {
                uploadId: job.upload_id,
                jobId: job.id,
                retries: job.retry_count,
                stage: "cron_process_upload",
              },
              organizationId: job.organization_id,
            });
          } catch {
            // Best-effort
          }
        }
        return { id: job.id, ok: false };
      }
    }),
  );

  // ── Phase B: entity.extract ───────────────────────────────────────────────
  const entityJobs = await claimPendingEntityJobs(BATCH_SIZE);

  const entityResults = await Promise.allSettled(
    entityJobs.map(async (job) => {
      if (!job.upload_id) {
        await markJobFailed(job.id, "Missing upload_id on entity job");
        return { id: job.id, ok: false };
      }

      try {
        // Fetch uploader's preferred_language for extraction hints
        const accountLang = await getUploaderLanguage(job.upload_id);
        await extractEntity(job.upload_id, accountLang);
        await markJobCompleted(job.id);
        // Enqueue section categorization after entity extraction.
        await createJob({
          organizationId: job.organization_id,
          actorId: job.actor_id,
          kind: "categorize_section",
          uploadId: job.upload_id,
        }).catch(() => {});
        // Fire trackable detection as best-effort (no retry needed).
        void runDetectTrackable(job.upload_id).catch(() => {});
        return { id: job.id, ok: true };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Entity extraction failed";
        if (job.retry_count < MAX_RETRIES) {
          await requeueJobForRetry(job.id, message, job.retry_count);
        } else {
          await markJobFailed(job.id, message);
        }
        return { id: job.id, ok: false };
      }
    }),
  );

  // ── Phase C: analyze_image ────────────────────────────────────────────────
  const imageJobs = await claimPendingImageJobs(BATCH_SIZE);

  const imageResults = await Promise.allSettled(
    imageJobs.map(async (job) => {
      if (!job.upload_id) {
        await markJobFailed(job.id, "Missing upload_id on image job");
        return { id: job.id, ok: false };
      }
      try {
        const accountLangImg = await getUploaderLanguage(job.upload_id);
        await runImageAnalysis(job.upload_id, accountLangImg);
        await markJobCompleted(job.id);
        // Enqueue section categorization after vision analysis.
        await createJob({
          organizationId: job.organization_id,
          actorId: job.actor_id,
          kind: "categorize_section",
          uploadId: job.upload_id,
        }).catch(() => {});
        return { id: job.id, ok: true };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Image analysis failed";
        if (job.retry_count < MAX_RETRIES) {
          await requeueJobForRetry(job.id, message, job.retry_count);
        } else {
          await markJobFailed(job.id, message);
        }
        return { id: job.id, ok: false };
      }
    }),
  );

  // ── Phase D: categorize_section ───────────────────────────────────────────
  const categorizationJobs = await claimPendingCategorizationJobs(BATCH_SIZE);

  const categorizationResults = await Promise.allSettled(
    categorizationJobs.map(async (job) => {
      if (!job.upload_id) {
        await markJobFailed(job.id, "Missing upload_id on categorization job");
        return { id: job.id, ok: false };
      }
      try {
        await runCategorizeSection(job.upload_id);
        await markJobCompleted(job.id);
        return { id: job.id, ok: true };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Categorization failed";
        if (job.retry_count < MAX_RETRIES) {
          await requeueJobForRetry(job.id, message, job.retry_count);
        } else {
          await markJobFailed(job.id, message);
        }
        return { id: job.id, ok: false };
      }
    }),
  );

  const countOk = (results: PromiseSettledResult<{ ok: boolean }>[]) =>
    results.filter((r) => r.status === "fulfilled" && r.value.ok).length;

  return NextResponse.json({
    extract: {
      processed: extractResults.length,
      succeeded: countOk(extractResults as PromiseSettledResult<{ ok: boolean }>[]),
    },
    entity: {
      processed: entityResults.length,
      succeeded: countOk(entityResults as PromiseSettledResult<{ ok: boolean }>[]),
    },
    image: {
      processed: imageResults.length,
      succeeded: countOk(imageResults as PromiseSettledResult<{ ok: boolean }>[]),
    },
    categorize: {
      processed: categorizationResults.length,
      succeeded: countOk(categorizationResults as PromiseSettledResult<{ ok: boolean }>[]),
    },
  });
}

/**
 * Fetch the uploader's preferred_language for an upload.
 * Used to pass language hints to extraction functions.
 */
async function getUploaderLanguage(uploadId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data: upload } = await admin
      .from("uploads")
      .select("uploaded_by")
      .eq("id", uploadId)
      .maybeSingle();
    if (!upload?.uploaded_by) return null;
    const { data: profile } = await admin
      .from("profiles")
      .select("preferred_language")
      .eq("id", upload.uploaded_by as string)
      .maybeSingle();
    return (profile as { preferred_language?: string } | null)?.preferred_language ?? null;
  } catch {
    return null;
  }
}
