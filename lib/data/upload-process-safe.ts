import "server-only";

import { createClient } from "@/lib/supabase/server";
import { processUpload } from "./upload-intelligence";
import { recordSystemEvent } from "./system-events";

/**
 * Wrap processUpload so a thrown exception in the background pass
 * (network blip, Claude timeout, malformed file) flips the upload to
 * status="failed" and emits a user-visible event. The old wrapper was
 * `.catch(() => {})`, which silently absorbed errors and left rows
 * stuck reading "Processing…" forever — the most common reliability
 * complaint.
 *
 * Lives in its own module (no "use server") so both the upload action
 * site and the stuck-detector can call it without triggering Next.js's
 * Server Action serialization rules.
 *
 * Best-effort throughout. If the failover itself fails, stuck-detection
 * will catch the row on the next inbox render and retry.
 */
export async function runProcessUploadSafely(
  uploadId: string,
  orgId: string,
): Promise<void> {
  try {
    await processUpload(uploadId);
  } catch (err) {
    try {
      const supabase = await createClient();
      await supabase
        .from("uploads")
        .update({ status: "failed" })
        .eq("id", uploadId);
      await recordSystemEvent({
        kind: "upload.failed",
        severity: "error",
        message:
          err instanceof Error ? err.message : "Background processing crashed",
        context: { uploadId, stage: "after_process_upload" },
        organizationId: orgId,
      });
    } catch {
      // Last-resort silence — stuck detection will catch this row on
      // the next inbox render.
    }
  }
}
