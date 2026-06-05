"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { logAuditEvent } from "./audit-log";
import { getLocalParts, getOriaTzCookieName } from "@/lib/utils/tz";
import { matchRitualByText, type Cadence } from "@/lib/rituals/streak";

export type RitualInput = {
  title: string;
  cadence: Cadence;
  /** Selected weekdays for "weekly" (0=Sun..6=Sat). */
  days: number[];
  /** "HH:MM" or null. */
  reminderTime: string | null;
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function sanitize(input: RitualInput): {
  title: string;
  cadence: Cadence;
  days: number[];
  reminder_time: string | null;
} | null {
  const title = input.title.trim().slice(0, 80);
  if (!title) return null;
  const cadence: Cadence = input.cadence === "weekly" ? "weekly" : "daily";
  let days =
    cadence === "weekly"
      ? [...new Set(input.days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort()
      : ALL_DAYS;
  if (cadence === "weekly" && days.length === 0) days = ALL_DAYS; // never a ritual you can't do
  const rt = (input.reminderTime ?? "").trim();
  const reminder_time = /^([01]\d|2[0-3]):[0-5]\d$/.test(rt) ? rt : null;
  return { title, cadence, days, reminder_time };
}

async function todayYmd(): Promise<string> {
  const tz = (await cookies()).get(getOriaTzCookieName())?.value ?? null;
  return getLocalParts(new Date(), tz).ymd;
}

export async function createRitual(input: RitualInput): Promise<{ ok: boolean }> {
  const clean = sanitize(input);
  if (!clean) return { ok: false };
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rituals")
    .insert({
      user_id: ctx.profile.id,
      organization_id: ctx.organization.id,
      title: clean.title,
      cadence: clean.cadence,
      days: clean.days,
      reminder_time: clean.reminder_time,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false };
  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "ritual.created",
    resourceType: "ritual",
    resourceId: (data as { id: string } | null)?.id ?? null,
    metadata: { cadence: clean.cadence, has_reminder: !!clean.reminder_time },
  });
  revalidatePath("/dashboard/health");
  return { ok: true };
}

export async function updateRitual(
  id: string,
  input: RitualInput,
): Promise<{ ok: boolean }> {
  const clean = sanitize(input);
  if (!clean) return { ok: false };
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("rituals")
    .update({
      title: clean.title,
      cadence: clean.cadence,
      days: clean.days,
      reminder_time: clean.reminder_time,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", ctx.profile.id);
  if (error) return { ok: false };
  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "ritual.updated",
    resourceType: "ritual",
    resourceId: id,
  });
  revalidatePath("/dashboard/health");
  return { ok: true };
}

export async function archiveRitual(id: string): Promise<{ ok: boolean }> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { error } = await supabase
    .from("rituals")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", ctx.profile.id);
  if (error) return { ok: false };
  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "ritual.archived",
    resourceType: "ritual",
    resourceId: id,
  });
  revalidatePath("/dashboard/health");
  return { ok: true };
}

/** Mark today done / undone for a ritual (tap). Idempotent via the unique
 *  (ritual_id, completed_date). Marking is audited; un-marking is not. */
export async function toggleRitualDone(id: string): Promise<{ ok: boolean; done: boolean }> {
  const ctx = await requireContext();
  const supabase = await createClient();
  // Confirm ownership (RLS also enforces it).
  const { data: owned } = await supabase
    .from("rituals")
    .select("id")
    .eq("id", id)
    .eq("user_id", ctx.profile.id)
    .maybeSingle();
  if (!owned) return { ok: false, done: false };

  const day = await todayYmd();
  const { data: existing } = await supabase
    .from("ritual_completions")
    .select("id")
    .eq("ritual_id", id)
    .eq("completed_date", day)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("ritual_completions")
      .delete()
      .eq("ritual_id", id)
      .eq("completed_date", day);
    revalidatePath("/dashboard/health");
    revalidatePath("/dashboard");
    return { ok: true, done: false };
  }

  const { error } = await supabase.from("ritual_completions").insert({
    ritual_id: id,
    user_id: ctx.profile.id,
    completed_date: day,
  });
  if (error) return { ok: false, done: false };
  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "ritual.completed",
    resourceType: "ritual",
    resourceId: id,
    metadata: { date: day },
  });
  revalidatePath("/dashboard/health");
  revalidatePath("/dashboard");
  return { ok: true, done: true };
}

/**
 * Mark a ritual done from free text / voice ("did my reading", "mark meditate
 * done"). Reuses the shared mic + composer on the Health surface; matching is
 * deterministic (no AI) so it never guesses wrong silently. Returns the matched
 * title, or ok:false when nothing clearly matched.
 */
export async function markRitualByText(
  text: string,
): Promise<{ ok: boolean; title?: string }> {
  const value = text.trim();
  if (!value) return { ok: false };
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data: ritualRows } = await supabase
    .from("rituals")
    .select("id, title")
    .eq("user_id", ctx.profile.id)
    .is("archived_at", null);
  const rituals = (ritualRows as { id: string; title: string }[]) ?? [];
  const match = matchRitualByText(value, rituals);
  if (!match) return { ok: false };

  const day = await todayYmd();
  const { data: existing } = await supabase
    .from("ritual_completions")
    .select("id")
    .eq("ritual_id", match.id)
    .eq("completed_date", day)
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase.from("ritual_completions").insert({
      ritual_id: match.id,
      user_id: ctx.profile.id,
      completed_date: day,
    });
    if (error) return { ok: false };
    await logAuditEvent({
      userId: ctx.profile.id,
      organizationId: ctx.organization.id,
      action: "ritual.completed",
      resourceType: "ritual",
      resourceId: match.id,
      metadata: { date: day, via: "text" },
    });
  }
  revalidatePath("/dashboard/health");
  revalidatePath("/dashboard");
  return { ok: true, title: match.title };
}
