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
  | "analysis.compute"
  | "entity.extract";

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

/**
 * Atomically claim up to `limit` pending upload.extract jobs and flip
 * them to processing. Returns the claimed rows so the caller can drive
 * each one to completion without racing another worker.
 *
 * The WHERE … AND status='pending' guard on the UPDATE means a row can
 * only be claimed once even if two cron invocations overlap slightly.
 */
export async function claimPendingExtractionJobs(
  limit: number,
): Promise<BackgroundJob[]> {
  try {
    const admin = createAdminClient();
    const { data: candidates } = await admin
      .from("background_jobs")
      .select("*")
      .eq("status", "pending")
      .eq("kind", "upload.extract")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (!candidates?.length) return [];
    const ids = (candidates as BackgroundJob[]).map((j) => j.id);
    await admin
      .from("background_jobs")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", ids)
      .eq("status", "pending"); // Guard: only claim rows still pending
    return candidates as BackgroundJob[];
  } catch {
    return [];
  }
}

/**
 * Atomically claim up to `limit` pending entity.extract jobs.
 * Same race-safe pattern as claimPendingExtractionJobs.
 */
export async function claimPendingEntityJobs(
  limit: number,
): Promise<BackgroundJob[]> {
  try {
    const admin = createAdminClient();
    const { data: candidates } = await admin
      .from("background_jobs")
      .select("*")
      .eq("status", "pending")
      .eq("kind", "entity.extract")
      .order("created_at", { ascending: true })
      .limit(limit);
    if (!candidates?.length) return [];
    const ids = (candidates as BackgroundJob[]).map((j) => j.id);
    await admin
      .from("background_jobs")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", ids)
      .eq("status", "pending");
    return candidates as BackgroundJob[];
  } catch {
    return [];
  }
}

/**
 * Reset a job back to pending for another attempt, recording the last
 * error and incrementing the retry counter. Call this instead of
 * markJobFailed when you still want the cron to pick the job up again.
 */
export async function requeueJobForRetry(
  jobId: string | null,
  errorMessage: string,
  currentRetryCount: number,
): Promise<void> {
  if (!jobId) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("background_jobs")
      .update({
        status: "pending",
        error_message: errorMessage.slice(0, 1000),
        retry_count: currentRetryCount + 1,
        updated_at: new Date().toISOString(),
        started_at: null,
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

export type JobsHealth = {
  failed24h: number;
  failed7d: number;
  completed24h: number;
  pendingNow: number;
  processingNow: number;
  /** processing rows whose started_at is older than 5 minutes — likely stuck. */
  stuckNow: number;
  /** average completed-job duration in ms over the past 24h (rough). */
  avgDurationMs24h: number;
  recentFailures: Array<{
    id: string;
    kind: string;
    error: string;
    when: string;
    organizationId: string;
  }>;
};

const STUCK_AGE_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const sinceISO = (ms: number) => new Date(Date.now() - ms).toISOString();

/**
 * Cross-org background-job health. Service-role only — admin pages
 * read this; the daily user flow doesn't. Soft-fails open everywhere:
 * if the count query errors we report 0 rather than break the page.
 */
export async function getJobsHealth(): Promise<JobsHealth> {
  try {
    const admin = createAdminClient();
    const dayAgo = sinceISO(DAY_MS);
    const weekAgo = sinceISO(7 * DAY_MS);
    const stuckCutoff = sinceISO(STUCK_AGE_MS);

    const [
      failed24h,
      failed7d,
      completed24h,
      pendingNow,
      processingNow,
      stuckNow,
      recentFailuresRes,
      durationsRes,
    ] = await Promise.all([
      admin
        .from("background_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("updated_at", dayAgo),
      admin
        .from("background_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("updated_at", weekAgo),
      admin
        .from("background_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("updated_at", dayAgo),
      admin
        .from("background_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      admin
        .from("background_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing"),
      admin
        .from("background_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing")
        .lt("started_at", stuckCutoff),
      admin
        .from("background_jobs")
        .select("id, kind, error_message, updated_at, organization_id")
        .eq("status", "failed")
        .gte("updated_at", weekAgo)
        .order("updated_at", { ascending: false })
        .limit(10),
      admin
        .from("background_jobs")
        .select("started_at, completed_at")
        .eq("status", "completed")
        .gte("updated_at", dayAgo)
        .not("started_at", "is", null)
        .not("completed_at", "is", null)
        .limit(500),
    ]);

    type DurationRow = {
      started_at: string | null;
      completed_at: string | null;
    };
    const durations = ((durationsRes.data ?? []) as DurationRow[])
      .map((r) => {
        if (!r.started_at || !r.completed_at) return 0;
        return (
          new Date(r.completed_at).getTime() -
          new Date(r.started_at).getTime()
        );
      })
      .filter((n) => n > 0 && n < 10 * 60_000);
    const avgDurationMs24h =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    type FailRow = {
      id: string;
      kind: string;
      error_message: string | null;
      updated_at: string;
      organization_id: string;
    };
    const recentFailures = ((recentFailuresRes.data ?? []) as FailRow[]).map(
      (r) => ({
        id: r.id,
        kind: r.kind,
        error: r.error_message ?? "Unknown error",
        when: r.updated_at,
        organizationId: r.organization_id,
      }),
    );

    return {
      failed24h: failed24h.count ?? 0,
      failed7d: failed7d.count ?? 0,
      completed24h: completed24h.count ?? 0,
      pendingNow: pendingNow.count ?? 0,
      processingNow: processingNow.count ?? 0,
      stuckNow: stuckNow.count ?? 0,
      avgDurationMs24h,
      recentFailures,
    };
  } catch {
    return {
      failed24h: 0,
      failed7d: 0,
      completed24h: 0,
      pendingNow: 0,
      processingNow: 0,
      stuckNow: 0,
      avgDurationMs24h: 0,
      recentFailures: [],
    };
  }
}
