import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { processUpload } from "./upload-intelligence";
import { recordSystemEvent } from "./system-events";
import {
  createJob,
  markJobCompleted,
  markJobFailed,
  markJobStarted,
} from "./jobs";

/**
 * Wrap processUpload so a thrown exception in the background pass
 * (network blip, Claude timeout, malformed file) flips the upload to
 * status="failed" AND records the failure on the background_jobs log
 * with an error message + bumped retry count. The old wrapper was
 * `.catch(() => {})`, which silently absorbed errors and left rows
 * stuck reading "Processing…" forever.
 *
 * The function also creates a job row on entry so every background
 * extraction is visible in the unified jobs log even when it
 * succeeds. The user-facing UI keeps reading uploads.status; jobs
 * exist for retry counts, error attribution, and stuck detection.
 *
 * Lives in its own module (no "use server") so both the upload action
 * site and the stuck-detector can call it without triggering Next.js's
 * Server Action serialization rules.
 *
 * COOKIE SAFETY: this runs inside Next's after() callback. By the
 * time we get here the HTTP response is gone and cookies/headers
 * aren't readable. Every DB write below uses the service-role admin
 * client so we never trip "cookies() called from outside a request".
 * Scope is preserved by the orgId + uploadId we were handed at
 * schedule time.
 */
export async function runProcessUploadSafely(
  uploadId: string,
  orgId: string,
): Promise<void> {
  const jobId = await createJob({
    organizationId: orgId,
    kind: "upload.extract",
    uploadId,
    context: { uploadId },
  });
  await markJobStarted(jobId);

  try {
    await processUpload(uploadId);
    await markJobCompleted(jobId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Background processing crashed";
    await markJobFailed(jobId, message);
    try {
      const supabase = createAdminClient();
      await supabase
        .from("uploads")
        .update({ status: "failed" })
        .eq("id", uploadId);
      await recordSystemEvent({
        kind: "upload.failed",
        severity: "error",
        message,
        context: { uploadId, stage: "after_process_upload", jobId },
        organizationId: orgId,
      });
    } catch {
      // Last-resort silence. stuck detection will catch this row on
      // the next inbox render.
    }
  }
}
