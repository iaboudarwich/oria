import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Background-job log. The user-facing status of an upload or report
 * still lives on the entity row (uploads.status, workspace_reports.
 * status) — this table is the parallel queue that lets us count
 * retries, attribute errors, and detect stuck rows in one place.
 *
 * Every helper is fire-and-forget: if the log write fails we swallow
 * the error so the real action (extraction, report generation, etc.)
 * never breaks because of telemetry. Same posture as
 * recordSystemEvent.
 *
 * Scope: every row carries an organization_id. Never cross-space.
 */

export type JobKind =
  | "upload.extract"
  | "report.generate"
  | "reminder.propose"
  | "analysis.compute";

export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retrying";

export type BackgroundJob = {
  id: string;
  organization_id: string;
  actor_id: string | null;
  kind: JobKind | string;
  status: JobStatus;
  upload_id: string | null;
  report_id: string | null;
  reminder_id: string | null;
  context: Record<string, unknown>;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type CreateInput = {
  organizationId: string;
  actorId?: string | null;
  kind: JobKind;
  uploadId?: string | null;
  reportId?: string | null;
  reminderId?: string | null;
  context?: Record<string, unknown>;
};

/**
 * Create a new job row in status="pending". Returns the id so the
 * caller can mark it processing/completed/failed as it progresses,
 * or null if the insert failed (which is non-fatal).
 */
export async function createJob(input: CreateInput): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("background_jobs")
      .insert({
        organization_id: input.organizationId,
        actor_id: input.actorId ?? null,
        kind: input.kind,
        status: "pending",
        upload_id: input.uploadId ?? null,
        report_id: input.reportId ?? null,
        reminder_id: input.reminderId ?? null,
        context: input.context ?? {},
      })
      .select("id")
      .single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  } catch {
    return null;
  }
}

/** Flip a job to processing and stamp started_at. */
export async function markJobStarted(jobId: string | null): Promise<void> {
  if (!jobId) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("background_jobs")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch {
    // Best-effort.
  }
}

/** Mark a job completed. Stamp completed_at and updated_at. */
export async function markJobCompleted(
  jobId: string | null,
  /** Optional context patch — merged via simple replace, not jsonb deep merge. */
  contextPatch?: Record<string, unknown>,
): Promise<void> {
  if (!jobId) return;
  try {
    const admin = createAdminClient();
    const update: Record<string, unknown> = {
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null,
    };
    if (contextPatch) update.context = contextPatch;
    await admin.from("background_jobs").update(update).eq("id", jobId);
  } catch {
    // Best-effort.
  }
}

/** Mark a job failed with an error message. Increment retry_count. */
export async function markJobFailed(
  jobId: string | null,
  errorMessage: string,
): Promise<void> {
  if (!jobId) return;
  try {
    const admin = createAdminClient();
    // Read current retry_count so we can bump it atomically-enough for
    // a single-writer scenario (each job only one runner at a time).
    const { data } = await admin
      .from("background_jobs")
      .select("retry_count")
      .eq("id", jobId)
      .maybeSingle();
    const prevCount =
      (data as { retry_count?: number } | null)?.retry_count ?? 0;
    await admin
      .from("background_jobs")
      .update({
        status: "failed",
        error_message: errorMessage.slice(0, 1000),
        retry_count: prevCount + 1,
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  } catch {
    // Best-effort.
  }
}

/**
 * Flip a failed job back to "retrying" so the UI can show the right
 * label while the next run is in flight. The caller is responsible
 * for actually re-running the work and calling markJobStarted / etc.
 */
export async function markJobRetrying(jobId: string | null): Promise<void> {
  if (!jobId) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("background_jobs")
      .update({
        status: "retrying",
        updated_at: new Date().toISOString(),
        error_message: null,
        completed_at: null,
      })
      .eq("id", jobId);
  } catch {
    // Best-effort.
  }
}

/** Recent jobs for one org, newest first. Used by ops surfaces. */
export async function listRecentJobs(input: {
  organizationId: string;
  kind?: JobKind | string;
  status?: JobStatus;
  limit?: number;
}): Promise<BackgroundJob[]> {
  try {
    const admin = createAdminClient();
    let q = admin
      .from("background_jobs")
      .select("*")
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(input.limit ?? 30);
    if (input.kind) q = q.eq("kind", input.kind);
    if (input.status) q = q.eq("status", input.status);
    const { data } = await q;
    return ((data ?? []) as BackgroundJob[]).map((j) => ({
      ...j,
      context: (j.context ?? {}) as Record<string, unknown>,
    }));
  } catch {
    return [];
  }
}
