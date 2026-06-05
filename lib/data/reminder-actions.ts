"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listUserSpaces, requireContext } from "./organizations";
import { recordLearningEvent } from "./learning";
import { logAuditEvent } from "./audit-log";
import { trackEvent } from "@/lib/analytics";
import { localDateTimeToISO, getOriaTzCookieName } from "@/lib/utils/tz";

function parseDueDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * The due instant from a reminder form. The user's date + time is interpreted
 * in THEIR timezone (the oria_tz cookie), so 2pm means 2pm to them, never
 * re-zoned through the server clock. There is NO silent fallback to now / 9am /
 * midnight: a date with no usable time throws so the caller refuses rather than
 * guess. A precise `due_at` instant from a caller is honored as-is. Shared by
 * create + update so edited times follow the exact same corrected logic.
 */
async function resolveDueAtFromForm(formData: FormData): Promise<string | null> {
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const dueAtRaw = String(formData.get("due_at") ?? "").trim();
  let due_at: string | null = null;
  if (dueAtRaw) {
    due_at = parseDueDate(dueAtRaw);
  } else if (date) {
    const tz = (await cookies()).get(getOriaTzCookieName())?.value ?? null;
    due_at = localDateTimeToISO(date, time, tz);
  }
  if ((date || dueAtRaw) && !due_at) {
    throw new Error("A reminder needs a date and time.");
  }
  return due_at;
}

export async function createReminder(formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const due_at = await resolveDueAtFromForm(formData);

  const upload_id_raw = String(formData.get("upload_id") ?? "").trim();
  const upload_id = upload_id_raw || null;
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;

  const ctx = await requireContext();
  const supabase = await createClient();

  const insert = await supabase
    .from("reminders")
    .insert({
      organization_id: ctx.organization.id,
      created_by: ctx.profile.id,
      title,
      notes,
      due_at,
      upload_id,
      source: "manual",
    })
    .select("id")
    .maybeSingle();

  const newId = (insert.data as { id: string } | null)?.id ?? null;
  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "reminder.created",
    resourceType: "reminder",
    resourceId: newId,
    metadata: { has_due_at: !!due_at, linked_upload: !!upload_id },
  });

  // Fire first_reminder_created on the user's very first reminder.
  const { count: reminderCount } = await supabase
    .from("reminders")
    .select("id", { count: "exact", head: true })
    .eq("created_by", ctx.profile.id);
  if ((reminderCount ?? 0) === 1) trackEvent("first_reminder_created");

  // Reflect on the Calendar agenda AND the Today home (its agenda reads the
  // same reminders), plus the source upload's detail.
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
  if (upload_id) revalidatePath(`/dashboard/uploads/${upload_id}`);
}

/**
 * Edit a reminder: title, notes, and the due date+time (recomputed with the
 * same timezone-correct, no-fallback logic as create). Scope-guarded to the
 * user's spaces and audited. Reflects on Today, the Calendar agenda, and the
 * source upload's detail.
 */
export async function updateReminder(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000) || null;
  const due_at = await resolveDueAtFromForm(formData);

  const ctx = await requireContext();
  const supabase = await createClient();
  const allowedOrgIds = await allowedReminderOrgIds();
  if (allowedOrgIds.length === 0) return;

  const { data: row } = await supabase
    .from("reminders")
    .update({ title, notes, due_at })
    .eq("id", id)
    .in("organization_id", allowedOrgIds)
    .select("organization_id, upload_id")
    .maybeSingle();

  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId:
      (row as { organization_id?: string } | null)?.organization_id ??
      ctx.organization.id,
    action: "reminder.updated",
    resourceType: "reminder",
    resourceId: id,
  });

  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
  const up = (row as { upload_id?: string | null } | null)?.upload_id;
  if (up) revalidatePath(`/dashboard/uploads/${up}`);
}

/**
 * Reminder mutations with explicit scope check.
 *
 * The calendar may show reminders from more than one space when the
 * Personal-owner uses God's Eye. So a mutated reminder might not be
 * pinned to the *active* org. but it must still belong to a space the
 * user is a member of. We restrict the update/delete with an explicit
 * `.in("organization_id", userSpaceIds)` rather than relying solely on
 * RLS, so a missing/incorrect policy can never silently widen the
 * blast radius.
 */

async function allowedReminderOrgIds(): Promise<string[]> {
  const spaces = await listUserSpaces();
  return spaces.map((s) => s.organization.id);
}

export async function toggleReminderDone(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const done = String(formData.get("done") ?? "") === "true";

  const supabase = await createClient();
  const allowedOrgIds = await allowedReminderOrgIds();
  if (allowedOrgIds.length === 0) return;

  await supabase
    .from("reminders")
    .update({ done: !done })
    .eq("id", id)
    .in("organization_id", allowedOrgIds);

  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
}

export async function deleteReminder(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const ctx = await requireContext();
  const supabase = await createClient();
  const allowedOrgIds = await allowedReminderOrgIds();
  if (allowedOrgIds.length === 0) return;

  // Capture the row before deletion so we can record a useful learning signal
  // (was it a suggestion the user rejected? a manual entry they cleaned up?)
  // and so we know which org to log against. the reminder may live in a
  // different org than the active one. The .in() filter is the scope guard:
  // a reminder outside the user's spaces would not be returned even if RLS
  // somehow let it slip.
  const { data: before } = await supabase
    .from("reminders")
    .select("source, upload_id, title, organization_id")
    .eq("id", id)
    .in("organization_id", allowedOrgIds)
    .maybeSingle();

  await supabase
    .from("reminders")
    .delete()
    .eq("id", id)
    .in("organization_id", allowedOrgIds);

  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: (before as { organization_id?: string } | null)?.organization_id ?? ctx.organization.id,
    action: "reminder.deleted",
    resourceType: "reminder",
    resourceId: id,
  });

  if (before) {
    const b = before as {
      source: string;
      upload_id: string | null;
      title: string;
      organization_id: string;
    };
    void recordLearningEvent({
      organizationId: b.organization_id,
      actorId: ctx.profile.id,
      kind: "reminder.dismissed",
      payload: { reminder_id: id, source: b.source, upload_id: b.upload_id },
    });
  }

  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
  const up = (before as { upload_id?: string | null } | null)?.upload_id;
  if (up) revalidatePath(`/dashboard/uploads/${up}`);
}

export async function confirmReminder(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const ctx = await requireContext();
  const supabase = await createClient();
  const allowedOrgIds = await allowedReminderOrgIds();
  if (allowedOrgIds.length === 0) return;

  const { data: row } = await supabase
    .from("reminders")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", id)
    .in("organization_id", allowedOrgIds)
    .select("organization_id")
    .maybeSingle();

  const orgId =
    (row as { organization_id: string } | null)?.organization_id ??
    ctx.organization.id;
  void recordLearningEvent({
    organizationId: orgId,
    actorId: ctx.profile.id,
    kind: "reminder.kept",
    payload: { reminder_id: id },
  });

  revalidatePath("/dashboard/calendar");
}
