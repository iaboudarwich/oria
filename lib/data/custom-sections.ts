import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { CustomSection } from "@/lib/supabase/types";

export async function listCustomSections(): Promise<CustomSection[]> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("custom_sections")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .order("name", { ascending: true });
  return (data ?? []) as CustomSection[];
}

export async function getCustomSectionById(
  id: string,
): Promise<CustomSection | null> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("custom_sections")
    .select("*")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  return (data as CustomSection | null) ?? null;
}

export async function countCustomSectionUploads(
  customSectionId: string,
): Promise<number> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { count } = await supabase
    .from("uploads")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", ctx.organization.id)
    .eq("custom_section_id", customSectionId)
    .is("deleted_at", null);
  return count ?? 0;
}
