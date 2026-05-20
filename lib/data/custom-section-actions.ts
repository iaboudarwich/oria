"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { SectionProfile } from "@/lib/supabase/types";

/**
 * Build a SectionProfile from FormData submitted by the new-section wizard.
 * Skips empty / unknown fields so the JSONB stays clean.
 */
function readProfile(formData: FormData): SectionProfile {
  const profile: SectionProfile = {};

  const kinds = formData
    .getAll("kinds")
    .map((v) => String(v).trim().toLowerCase())
    .filter((v) => v.length > 0);
  if (kinds.length > 0) profile.kinds = Array.from(new Set(kinds));

  const mode = String(formData.get("mode") ?? "").trim();
  if (mode) profile.mode = mode;

  const priority = String(formData.get("priority") ?? "").trim();
  if (priority) profile.priority = priority;

  const related = String(formData.get("related") ?? "").trim();
  if (related) profile.related = related.slice(0, 280);

  return profile;
}

export async function createCustomSection(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 60);
  if (!name) return;

  const profile = readProfile(formData);

  const ctx = await requireContext();
  const supabase = await createClient();

  await supabase.from("custom_sections").insert({
    organization_id: ctx.organization.id,
    name,
    profile,
    created_by: ctx.profile.id,
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings");
}

export async function deleteCustomSection(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const ctx = await requireContext();
  const supabase = await createClient();
  await supabase
    .from("custom_sections")
    .delete()
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard/settings");
}

export async function renameCustomSection(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 60);
  if (!id || !name) return;

  const ctx = await requireContext();
  const supabase = await createClient();
  await supabase
    .from("custom_sections")
    .update({ name })
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings");
}
