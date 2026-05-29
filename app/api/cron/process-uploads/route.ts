import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  claimPendingExtractionJobs,
  claimPendingEntityJobs,
  createJob,
  markJobCompleted,
  markJobFailed,
  requeueJobForRetry,
} from "@/lib/data/jobs";
import { processUpload } from "@/lib/data/upload-intelligence";
import { extractEntity } from "@/lib/ai/extract-entities";
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

        // Enqueue entity extraction for the next phase / cron tick.
        await createJob({
          organizationId: job.organization_id,
          actorId: job.actor_id,
          kind: "entity.extract",
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
        await extractEntity(job.upload_id);
        await markJobCompleted(job.id);
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
  });
}
