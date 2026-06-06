"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext, listUserSpaces } from "./organizations";
import { logAuditEvent } from "./audit-log";
import { recordSystemEvent } from "./system-events";
import { localDateTimeToISO, getOriaTzCookieName } from "@/lib/utils/tz";
import {
  actionNeedsClarification,
  type ProposedAction,
  type WriteActionType,
} from "@/lib/actions/write-actions";

/**
 * The write-back runner (Round 21). Every Oria-performed mutation flows through
 * here behind the rails: it executes ONLY after the caller has confirmed (the
 * UI/voice shows the plain statement), it is idempotent (the client-supplied
 * action id is the primary key, so a retry/double-tap cannot double-execute),
 * it records enough to FULLY reverse, audits the action, and on failure writes
 * a diagnostic. undoWriteAction reverses and audits the undo. Own data only,
 * all reversible; no external-provider writes, no sends.
 */

async function allowedOrgIds(): Promise<string[]> {
  const spaces = await listUserSpaces();
  return spaces.map((s) => s.organization.id);
}

type ExecResult = {
  targetTable: string;
  targetId: string | null;
  undo: Record<string, unknown>;
  auditAction: "reminder.created" | "reminder.updated" | "reminder.deleted" | "trackable.updated";
};

export async function executeWriteAction(input: {
  actionId: string;
  action: ProposedAction;
  /** The localized confirmation the user saw, stored for the undo toast + history. */
  summary: string;
}): Promise<{ ok: boolean; summary?: string; error?: string }> {
  const ctx = await requireContext();
  const { actionId, action } = input;
  const summary = (input.summary ?? "").slice(0, 300);
  if (!actionId) return { ok: false, error: "bad_request" };

  // Safety gate: never execute an incomplete action. The caller should have
  // asked the user; this is the last line.
  const clarify = actionNeedsClarification(action);
  if (clarify) return { ok: false, error: `clarify:${clarify}` };

  const admin = createAdminClient();
  // Idempotency: claim the id. A conflict means it was already run with this id.
  const claim = await admin
    .from("write_actions")
    .insert({
      id: actionId,
      user_id: ctx.profile.id,
      organization_id: ctx.organization.id,
      type: action.type,
      summary,
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (claim.error) {
    const { data: existing } = await admin
      .from("write_actions")
      .select("status, summary")
      .eq("id", actionId)
      .maybeSingle();
    const e = existing as { status?: string; summary?: string } | null;
    return { ok: !!e && e.status !== "failed", summary: e?.summary };
  }

  try {
    const supabase = await createClient();
    const result = await performAction(ctx, supabase, action);
    await admin
      .from("write_actions")
      .update({
        status: "executed",
        executed_at: new Date().toISOString(),
        target_table: result.targetTable,
        target_id: result.targetId,
        undo: result.undo,
      })
      .eq("id", actionId);
    await logAuditEvent({
      userId: ctx.profile.id,
      organizationId: ctx.organization.id,
      action: result.auditAction,
      resourceType: result.targetTable,
      resourceId: result.targetId,
      metadata: { action_id: actionId, via: "write_action" },
    });
    await logAuditEvent({
      userId: ctx.profile.id,
      organizationId: ctx.organization.id,
      action: "write_action.executed",
      resourceType: "write_action",
      resourceId: actionId,
      metadata: { type: action.type },
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/trackables");
    return { ok: true, summary };
  } catch (e) {
    await admin.from("write_actions").update({ status: "failed" }).eq("id", actionId);
    await recordSystemEvent({
      kind: "write_action.failed",
      severity: "error",
      message: `Write action failed: ${action.type}`,
      context: {
        type: action.type,
        action_id: actionId,
        message: (e as Error).message.slice(0, 120),
      },
      actorId: ctx.profile.id,
    });
    return { ok: false, error: "failed" };
  }
}

export async function undoWriteAction(actionId: string): Promise<{ ok: boolean }> {
  const ctx = await requireContext();
  if (!actionId) return { ok: false };
  const admin = createAdminClient();
  const { data } = await admin
    .from("write_actions")
    .select("type, status, organization_id, target_table, target_id, undo")
    .eq("id", actionId)
    .eq("user_id", ctx.profile.id)
    .maybeSingle();
  const row = data as {
    type: WriteActionType;
    status: string;
    organization_id: string | null;
    target_table: string | null;
    target_id: string | null;
    undo: Record<string, unknown>;
  } | null;
  // Idempotent: nothing to undo if it never executed or was already undone.
  if (!row || row.status !== "executed") return { ok: true };

  try {
    const supabase = await createClient();
    await reverseAction(supabase, row.type, row.undo);
    await admin
      .from("write_actions")
      .update({ status: "undone", undone_at: new Date().toISOString() })
      .eq("id", actionId);
    await logAuditEvent({
      userId: ctx.profile.id,
      organizationId: row.organization_id ?? ctx.organization.id,
      action: "write_action.undone",
      resourceType: row.target_table ?? "write_action",
      resourceId: row.target_id,
      metadata: { action_id: actionId, type: row.type },
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/trackables");
    return { ok: true };
  } catch (e) {
    await recordSystemEvent({
      kind: "write_action.failed",
      severity: "error",
      message: `Undo failed: ${row.type}`,
      context: {
        type: row.type,
        action_id: actionId,
        undo: true,
        message: (e as Error).message.slice(0, 120),
      },
      actorId: ctx.profile.id,
    });
    return { ok: false };
  }
}

type Sb = Awaited<ReturnType<typeof createClient>>;
type Ctx = Awaited<ReturnType<typeof requireContext>>;

async function performAction(ctx: Ctx, supabase: Sb, action: ProposedAction): Promise<ExecResult> {
  const orgIds = await allowedOrgIds();

  if (action.type === "reminder.create") {
    const tz = (await cookies()).get(getOriaTzCookieName())?.value ?? null;
    const due_at = localDateTimeToISO(action.date as string, action.time as string, tz);
    if (!due_at) throw new Error("bad_due");
    const { data, error } = await supabase
      .from("reminders")
      .insert({
        organization_id: ctx.organization.id,
        created_by: ctx.profile.id,
        title: action.title,
        due_at,
        source: "voice",
      })
      .select("id")
      .maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "insert_failed");
    const id = (data as { id: string }).id;
    return {
      targetTable: "reminders",
      targetId: id,
      undo: { reminderId: id },
      auditAction: "reminder.created",
    };
  }

  if (action.type === "reminder.complete") {
    const { data: prior } = await supabase
      .from("reminders")
      .select("done")
      .eq("id", action.reminderId)
      .in("organization_id", orgIds)
      .maybeSingle();
    const priorDone = (prior as { done?: boolean } | null)?.done ?? false;
    const { error } = await supabase
      .from("reminders")
      .update({ done: true })
      .eq("id", action.reminderId)
      .in("organization_id", orgIds);
    if (error) throw new Error(error.message);
    return {
      targetTable: "reminders",
      targetId: action.reminderId,
      undo: { reminderId: action.reminderId, priorDone },
      auditAction: "reminder.updated",
    };
  }

  if (action.type === "reminder.delete") {
    const { data: row } = await supabase
      .from("reminders")
      .select("*")
      .eq("id", action.reminderId)
      .in("organization_id", orgIds)
      .maybeSingle();
    if (!row) throw new Error("not_found");
    const { error } = await supabase
      .from("reminders")
      .delete()
      .eq("id", action.reminderId)
      .in("organization_id", orgIds);
    if (error) throw new Error(error.message);
    return {
      targetTable: "reminders",
      targetId: action.reminderId,
      undo: { row },
      auditAction: "reminder.deleted",
    };
  }

  if (action.type === "reminder.edit") {
    const { data: prior } = await supabase
      .from("reminders")
      .select("title, notes, due_at")
      .eq("id", action.reminderId)
      .in("organization_id", orgIds)
      .maybeSingle();
    if (!prior) throw new Error("not_found");
    const patch: Record<string, unknown> = {};
    if (action.title) patch.title = action.title;
    if (action.date) {
      const tz = (await cookies()).get(getOriaTzCookieName())?.value ?? null;
      const due = localDateTimeToISO(action.date, action.time ?? "09:00", tz);
      if (due) patch.due_at = due;
    }
    const { error } = await supabase
      .from("reminders")
      .update(patch)
      .eq("id", action.reminderId)
      .in("organization_id", orgIds);
    if (error) throw new Error(error.message);
    return {
      targetTable: "reminders",
      targetId: action.reminderId,
      undo: { reminderId: action.reminderId, prior },
      auditAction: "reminder.updated",
    };
  }

  // trackable.status
  const { data: prior } = await supabase
    .from("trackables")
    .select("status")
    .eq("id", action.trackableId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!prior) throw new Error("not_found");
  const priorStatus = (prior as { status?: string }).status ?? "active";
  const { error } = await supabase
    .from("trackables")
    .update({ status: action.status })
    .eq("id", action.trackableId)
    .eq("organization_id", ctx.organization.id);
  if (error) throw new Error(error.message);
  return {
    targetTable: "trackables",
    targetId: action.trackableId,
    undo: { trackableId: action.trackableId, priorStatus },
    auditAction: "trackable.updated",
  };
}

async function reverseAction(
  supabase: Sb,
  type: WriteActionType,
  undo: Record<string, unknown>,
): Promise<void> {
  const orgIds = await allowedOrgIds();

  if (type === "reminder.create") {
    await supabase
      .from("reminders")
      .delete()
      .eq("id", undo.reminderId as string)
      .in("organization_id", orgIds);
    return;
  }
  if (type === "reminder.delete") {
    // Re-insert the captured row verbatim (same id), restoring it.
    await supabase.from("reminders").insert(undo.row as Record<string, unknown>);
    return;
  }
  if (type === "reminder.complete") {
    await supabase
      .from("reminders")
      .update({ done: (undo.priorDone as boolean) ?? false })
      .eq("id", undo.reminderId as string)
      .in("organization_id", orgIds);
    return;
  }
  if (type === "reminder.edit") {
    const prior =
      (undo.prior as { title?: string; notes?: string | null; due_at?: string | null }) ?? {};
    await supabase
      .from("reminders")
      .update({ title: prior.title, notes: prior.notes ?? null, due_at: prior.due_at ?? null })
      .eq("id", undo.reminderId as string)
      .in("organization_id", orgIds);
    return;
  }
  // trackable.status
  await supabase
    .from("trackables")
    .update({ status: (undo.priorStatus as string) ?? "active" })
    .eq("id", undo.trackableId as string);
}
