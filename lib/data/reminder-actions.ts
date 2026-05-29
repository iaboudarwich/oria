"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listUserSpaces, requireContext } from "./organizations";
import { recordLearningEvent } from "./learning";

function combineDateTime(date: string, time: string): string | null {
  if (!date) return null;
  const timeStr = time && /^\d{2}:\d{2}/.test(time) ? time : "09:00";
  const d = new Date(`${date}T${timeStr}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseDueDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function createReminder(formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  // Two accepted shapes:
  //   1. date + (optional) time inputs from the lightweight picker
  //   2. a single datetime-local string in `due_at` (legacy callers)
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  let due_at: string | null = null;
  if (date) {
    due_at = combineDateTime(date, time);
  } else {
    due_at = parseDueDate(String(formData.get("due_at") ?? "") || null);
  }

  const upload_id_raw = String(formData.get("upload_id") ?? "").trim();
  const upload_id = upload_id_raw || null;

  const ctx = await requireContext();
  const supabase = await createClient();

  await supabase.from("reminders").insert({
    organization_id: ctx.organization.id,
    created_by: ctx.profile.id,
    title,
    due_at,
    upload_id,
    source: "manual",
  });

  // Narrow scope: calendar is the only surface that lists reminders.
  // Hitting "/dashboard" used to invalidate the entire layout (sidebar
  // chrome, sections list, etc.) which made the action feel heavy.
  revalidatePath("/dashboard/calendar");
  if (upload_id) revalidatePath(`/dashboard/uploads/${upload_id}`);
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
