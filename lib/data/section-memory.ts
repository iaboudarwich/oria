import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { SectionScope } from "./section-scope";

export type SectionMemory = {
  id: string;
  content: string;
  source: "user" | "pattern" | "confirmation";
  created_at: string;
};

/**
 * Read every saved memory for a section in the active org. The section AI
 * weaves these into its system prompt; the memory panel renders them.
 */
export async function listSectionMemories(scope: SectionScope): Promise<SectionMemory[]> {
  const ctx = await requireContext();
  const supabase = await createClient();

  let q = supabase
    .from("section_memories")
    .select("id, content, source, created_at")
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (scope.kind === "builtin") q = q.eq("builtin_section", scope.key);
  else if (scope.kind === "custom") q = q.eq("custom_section_id", scope.key);
  else q = q.eq("smart_section", scope.key);

  const { data } = await q;
  return (data ?? []) as SectionMemory[];
}
