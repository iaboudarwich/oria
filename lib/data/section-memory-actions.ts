"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { SectionScope } from "./section-scope";
import type { Section } from "@/lib/supabase/types";

/**
 * Persist a new section memory. FormData shape:
 *   scope_kind: "builtin" | "custom" | "smart"
 *   scope_key:  Section enum | custom uuid | "diet" | "bills"
 *   scope_label?: friendly label, only used to revalidate the right page
 *   content:    short free-form fact
 *   source?:    "user" | "confirmation" (defaults to "user")
 */
export async function addSectionMemory(formData: FormData): Promise<void> {
  const content = String(formData.get("content") ?? "")
    .trim()
    .slice(0, 500);
  if (!content) return;

  const scope = readScope(formData);
  if (!scope) return;

  const source = String(formData.get("source") ?? "user");
  const safeSource = source === "confirmation" ? "confirmation" : "user";

  const ctx = await requireContext();
  const supabase = await createClient();

  await supabase.from("section_memories").insert({
    organization_id: ctx.organization.id,
    builtin_section: scope.kind === "builtin" ? scope.key : null,
    custom_section_id: scope.kind === "custom" ? scope.key : null,
    smart_section: scope.kind === "smart" ? scope.key : null,
    content,
    source: safeSource,
    created_by: ctx.profile.id,
  });

  revalidatePathForScope(scope);
}

export async function deleteSectionMemory(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const ctx = await requireContext();
  const scope = readScope(formData);
  const supabase = await createClient();
  // Soft-delete, scoped to the active org for defense-in-depth on top
  // of RLS so a stray id can never remove a memory in another space.
  await supabase
    .from("section_memories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);

  if (scope) revalidatePathForScope(scope);
  else revalidatePath("/dashboard");
}

/**
 * Edit an existing memory in place. Promotes pattern-source memories
 * to "user" so they stop reading as "Oria suggested" once the user has
 * deliberately edited them.
 */
export async function updateSectionMemory(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const content = String(formData.get("content") ?? "")
    .trim()
    .slice(0, 500);
  if (!id || !content) return;

  const ctx = await requireContext();
  const scope = readScope(formData);
  const supabase = await createClient();

  await supabase
    .from("section_memories")
    .update({
      content,
      source: "user",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);

  if (scope) revalidatePathForScope(scope);
  else revalidatePath("/dashboard");
}

function readScope(formData: FormData): SectionScope | null {
  const kind = String(formData.get("scope_kind") ?? "");
  const key = String(formData.get("scope_key") ?? "").trim();
  const label = String(formData.get("scope_label") ?? "").trim() || key;
  if (!key) return null;
  if (kind === "builtin") return { kind: "builtin", key: key as Section, label };
  if (kind === "custom") return { kind: "custom", key, label };
  if (kind === "smart" && (key === "diet" || key === "bills")) {
    return { kind: "smart", key, label };
  }
  return null;
}

function revalidatePathForScope(scope: SectionScope): void {
  if (scope.kind === "smart") {
    revalidatePath(scope.key === "diet" ? "/dashboard/health" : "/dashboard/bills");
    return;
  }
  revalidatePath(`/dashboard/sections/${scope.key}`);
}
