import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sectionLabel } from "@/lib/sections-meta";
import type { Section } from "@/lib/supabase/types";

const BUILTIN_SECTIONS = new Set<string>([
  "household", "travel", "properties", "staff", "events",
  "finance", "legal", "personal", "vendors", "health",
]);

export type LearnedRuleView = {
  id: string;
  matchType: string;
  matchValue: string;
  sectionName: string;
};

/**
 * List the user's active (user-confirmed) learned routing rules for an org,
 * with the target section resolved to a display name. Suppressions are hidden.
 */
export async function listLearnedRules(
  userId: string,
  orgId: string,
): Promise<LearnedRuleView[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("learned_routing_rules")
    .select("id, match_type, match_value, target_section_key")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .eq("source", "user_confirmed")
    .order("created_at", { ascending: false });
  const rows = (data as
    | { id: string; match_type: string; match_value: string; target_section_key: string }[]
    | null) ?? [];
  if (rows.length === 0) return [];

  // Resolve any custom-section ids to names in one query.
  const customIds = rows
    .map((r) => r.target_section_key)
    .filter((k) => !BUILTIN_SECTIONS.has(k));
  const nameById = new Map<string, string>();
  if (customIds.length > 0) {
    const { data: secs } = await admin
      .from("custom_sections")
      .select("id, name")
      .eq("organization_id", orgId)
      .in("id", customIds);
    for (const s of (secs as { id: string; name: string }[] | null) ?? []) {
      nameById.set(s.id, s.name);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    matchType: r.match_type,
    matchValue: r.match_value,
    sectionName: BUILTIN_SECTIONS.has(r.target_section_key)
      ? sectionLabel(r.target_section_key as Section)
      : nameById.get(r.target_section_key) ?? r.target_section_key,
  }));
}
