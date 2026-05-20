import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { Section } from "@/lib/supabase/types";

export type MemberSectionRef =
  | { kind: "builtin"; key: Section }
  | { kind: "custom"; key: string };

/**
 * Sections explicitly granted to a "limited" member. Returns an empty array
 * if the member is owner / full / assigned (those don't use the allowlist).
 */
export async function listMemberSectionRefs(
  membershipId: string,
): Promise<MemberSectionRef[]> {
  const ctx = await requireContext();
  const supabase = await createClient();

  // Scope: only look up rows for memberships in the active org.
  const memRes = await supabase
    .from("memberships")
    .select("id, organization_id")
    .eq("id", membershipId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!memRes.data) return [];

  const { data } = await supabase
    .from("membership_sections")
    .select("builtin_section, custom_section_id")
    .eq("membership_id", membershipId);

  return ((data ?? []) as Array<{
    builtin_section: Section | null;
    custom_section_id: string | null;
  }>)
    .map((r) =>
      r.builtin_section
        ? ({ kind: "builtin", key: r.builtin_section } as MemberSectionRef)
        : r.custom_section_id
          ? ({ kind: "custom", key: r.custom_section_id } as MemberSectionRef)
          : null,
    )
    .filter((x): x is MemberSectionRef => !!x);
}

// Labels live in their own file (no server-only import) so client components
// can reuse them. Re-exported here for backward compatibility.
export {
  ACCESS_LEVEL_LABELS,
  ACCESS_LEVEL_BLURBS,
} from "./access-labels";
