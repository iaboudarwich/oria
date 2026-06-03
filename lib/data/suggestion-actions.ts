"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logAuditEvent } from "@/lib/data/audit-log";
import { createJob } from "@/lib/data/jobs";
import type {
  SuggestionAction,
  SuggestionPattern,
} from "@/lib/daily/suggestions";

/**
 * Accept a reminder suggestion. creates a reminder with lead_days,
 * source_upload_id, and auto_suggested=true.
 */
export async function acceptSuggestion(input: {
  uploadId: string;
  organizationId: string;
  title: string;
  targetDate: string;
  leadDays: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not signed in." };

    const { error } = await supabase.from("reminders").insert({
      title: input.title,
      due_at: input.targetDate,
      lead_days: input.leadDays,
      source_upload_id: input.uploadId,
      auto_suggested: true,
      created_by: user.id,
      upload_id: input.uploadId,
      organization_id: input.organizationId,
      done: false,
    });

    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/uploads/${input.uploadId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Dismiss a suggestion so it never re-appears for this user.
 */
export async function dismissSuggestion(
  suggestionKey: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("dismissed_suggestions")
      .upsert(
        { user_id: user.id, suggestion_key: suggestionKey },
        { onConflict: "user_id,suggestion_key" },
      );
  } catch {
    // Best-effort
  }
}

/* ------------------------------------------------------------------ */
/* Round 16 daily-loop suggestions: Yes / No / Comment                 */
/* ------------------------------------------------------------------ */

type SuggestionResult = { ok: true } | { ok: false; error: string };

/**
 * Yes: execute the suggestion's real write, then audit-log the acceptance.
 *
 * Authorization: every write goes through the RLS client (scoped to the
 * signed-in user) so a forged action can only ever touch the caller's own
 * data. The one admin-backed step (re-queueing a failed upload via createJob)
 * is gated behind an RLS read of the upload first, so the caller cannot
 * re-queue a document they cannot see.
 */
export async function executeSuggestion(input: {
  key: string;
  pattern: SuggestionPattern;
  action: SuggestionAction;
  organizationId: string;
}): Promise<SuggestionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not signed in." };

    const { action, organizationId } = input;
    let resourceType = "suggestion";
    let resourceId: string | null = null;

    if (action.kind === "create_reminder") {
      const { data, error } = await supabase
        .from("reminders")
        .insert({
          title: action.title,
          due_at: action.dueAt,
          lead_days: action.leadDays,
          source_upload_id: action.uploadId,
          upload_id: action.uploadId,
          auto_suggested: true,
          created_by: user.id,
          organization_id: organizationId,
          done: false,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      resourceType = "reminder";
      resourceId = (data?.id as string) ?? null;
    } else if (action.kind === "create_trackable") {
      const { data, error } = await supabase
        .from("trackables")
        .insert({
          title: action.title,
          category: action.category,
          cost_period: action.costPeriod,
          organization_id: organizationId,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      resourceType = "trackable";
      resourceId = (data?.id as string) ?? null;
    } else if (action.kind === "file_upload") {
      const { error } = await supabase
        .from("uploads")
        .update({ section: action.section })
        .eq("id", action.uploadId);
      if (error) return { ok: false, error: error.message };
      resourceType = "upload";
      resourceId = action.uploadId;
    } else if (action.kind === "requeue_upload") {
      // Gate the admin-backed re-queue behind an RLS read for ownership.
      const { data: upload } = await supabase
        .from("uploads")
        .select("id, organization_id")
        .eq("id", action.uploadId)
        .maybeSingle();
      if (!upload) return { ok: false, error: "Not found." };
      await supabase
        .from("uploads")
        .update({ status: "received" })
        .eq("id", action.uploadId);
      await createJob({
        organizationId: upload.organization_id as string,
        actorId: user.id,
        kind: "upload.extract",
        uploadId: action.uploadId,
      });
      resourceType = "upload";
      resourceId = action.uploadId;
    }

    await logAuditEvent({
      userId: user.id,
      action: "suggestion.accepted",
      organizationId,
      resourceType,
      resourceId,
      metadata: { pattern: input.pattern, key: input.key, actionKind: action.kind },
    });

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * No: dismiss the suggestion (it never resurfaces) and audit the dismissal.
 * The persisted dismissal is the feedback signal that informs future runs.
 */
export async function declineSuggestion(input: {
  key: string;
  pattern: SuggestionPattern;
  organizationId: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("dismissed_suggestions")
      .upsert(
        { user_id: user.id, suggestion_key: input.key },
        { onConflict: "user_id,suggestion_key" },
      );
    await logAuditEvent({
      userId: user.id,
      action: "suggestion.dismissed",
      organizationId: input.organizationId,
      resourceType: "suggestion",
      metadata: { pattern: input.pattern, key: input.key },
    });
    revalidatePath("/dashboard");
  } catch {
    // Best-effort
  }
}

/**
 * Comment: the user steers a suggestion in their own words. We keep the card
 * and record the comment to the audit log (visible to the user) so the intent
 * is captured. Deeper steering (feeding the comment into the Conversation AI's
 * future suggestion context) is future work.
 */
export async function commentOnSuggestion(input: {
  key: string;
  pattern: SuggestionPattern;
  comment: string;
  organizationId: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const comment = input.comment.slice(0, 500);
    await logAuditEvent({
      userId: user.id,
      action: "suggestion.commented",
      organizationId: input.organizationId,
      resourceType: "suggestion",
      metadata: { pattern: input.pattern, key: input.key, comment },
    });
  } catch {
    // Best-effort
  }
}
