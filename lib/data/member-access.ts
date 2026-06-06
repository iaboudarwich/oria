import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { Section } from "@/lib/supabase/types";

export type MemberSectionRef =
  | { kind: "builtin"; key: Section; can_write: boolean }
  | { kind: "custom"; key: string; can_write: boolean };

/**
 * Sections explicitly granted to a "limited" member, including whether
 * they have write access to each section. Returns an empty array for
 * owner / full / assigned (those don't use the allowlist).
 */
export async function listMemberSectionRefs(membershipId: string): Promise<MemberSectionRef[]> {
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
    .select("builtin_section, custom_section_id, can_write")
    .eq("membership_id", membershipId);

  return (
    (data ?? []) as Array<{
      builtin_section: Section | null;
      custom_section_id: string | null;
      can_write: boolean;
    }>
  )
    .map((r) =>
      r.builtin_section
        ? ({
            kind: "builtin",
            key: r.builtin_section,
            can_write: r.can_write ?? false,
          } as MemberSectionRef)
        : r.custom_section_id
          ? ({
              kind: "custom",
              key: r.custom_section_id,
              can_write: r.can_write ?? false,
            } as MemberSectionRef)
          : null,
    )
    .filter((x): x is MemberSectionRef => !!x);
}

// Labels live in their own file (no server-only import) so client components
// can reuse them. Re-exported here for backward compatibility.
export { ACCESS_LEVEL_LABELS, ACCESS_LEVEL_BLURBS } from "./access-labels";
