import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  claimPendingExtractionJobs,
  markJobCompleted,
  markJobFailed,
  requeueJobForRetry,
} from "@/lib/data/jobs";
import { processUpload } from "@/lib/data/upload-intelligence";
import { recordSystemEvent } from "@/lib/data/system-events";

/** Maximum concurrent extractions per cron tick. */
const BATCH_SIZE = 3;
/** Give up permanently after this many total attempts (initial + retries). */
const MAX_RETRIES = 3;

/**
 * GET /api/cron/process-uploads
 *
 * Called by Vercel Cron every minute (see vercel.json). Claims up to
 * BATCH_SIZE pending upload.extract jobs atomically, runs each one,
 * and handles retries / permanent failures. Auth: Bearer CRON_SECRET.
 *
 * The per-row guard in claimPendingExtractionJobs (WHERE status='pending'
 * on the UPDATE) ensures two overlapping cron invocations can never
 * double-process the same job.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await claimPendingExtractionJobs(BATCH_SIZE);
  if (!jobs.length) {
    return NextResponse.json({ processed: 0, succeeded: 0, failed: 0 });
  }

  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      if (!job.upload_id) {
        await markJobFailed(job.id, "Missing upload_id on job row");
        return { id: job.id, ok: false };
      }

      try {
        await processUpload(job.upload_id);
        await markJobCompleted(job.id);
        return { id: job.id, ok: true };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Cron extraction failed";

        if (job.retry_count < MAX_RETRIES) {
          // Requeue for the next cron tick. retry_count is incremented so
          // we eventually fall through to permanent failure.
          await requeueJobForRetry(job.id, message, job.retry_count);
        } else {
          // All retries exhausted — mark the job and the upload row failed.
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
            // Best-effort — stuck detection will surface this row.
          }
        }
        return { id: job.id, ok: false };
      }
    }),
  );

  const succeeded = results.filter(
    (r) => r.status === "fulfilled" && (r.value as { ok: boolean }).ok,
  ).length;
  const failed = results.length - succeeded;

  return NextResponse.json({ processed: results.length, succeeded, failed });
}
