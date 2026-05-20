import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type {
  AccessLevel,
  Invite,
  Profile,
  Role,
} from "@/lib/supabase/types";

export type CircleMember = {
  id: string; // membership id
  user_id: string;
  role: Role;
  access_level: AccessLevel;
  title: string | null;
  profile: Pick<Profile, "id" | "full_name" | "email"> | null;
  created_at: string;
};

export async function listCircleMembers(): Promise<CircleMember[]> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, user_id, role, access_level, title, created_at")
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: true });

  const rows = (memberships ?? []) as {
    id: string;
    user_id: string;
    role: Role;
    access_level: AccessLevel;
    title: string | null;
    created_at: string;
  }[];
  if (rows.length === 0) return [];

  const ids = Array.from(new Set(rows.map((m) => m.user_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);

  const profileMap = new Map<string, Pick<Profile, "id" | "full_name" | "email">>();
  (profiles ?? []).forEach((p) => {
    const row = p as Pick<Profile, "id" | "full_name" | "email">;
    profileMap.set(row.id, row);
  });

  return rows.map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    access_level: m.access_level,
    title: m.title,
    created_at: m.created_at,
    profile: profileMap.get(m.user_id) ?? null,
  }));
}

export async function listPendingInvites(): Promise<Invite[]> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("invites")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as Invite[];
}

/**
 * Sections explicitly granted to a "limited" invite. Returns [] if the invite
 * is full / assigned. Used by the manage panel + the join preview.
 */
export async function listInviteSectionRefs(
  inviteId: string,
): Promise<Array<{ kind: "builtin" | "custom"; key: string }>> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const inv = await supabase
    .from("invites")
    .select("id, organization_id")
    .eq("id", inviteId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!inv.data) return [];

  const { data } = await supabase
    .from("invite_sections")
    .select("builtin_section, custom_section_id")
    .eq("invite_id", inviteId);

  return ((data ?? []) as Array<{
    builtin_section: string | null;
    custom_section_id: string | null;
  }>)
    .map((r) =>
      r.builtin_section
        ? ({ kind: "builtin", key: r.builtin_section } as const)
        : r.custom_section_id
          ? ({ kind: "custom", key: r.custom_section_id } as const)
          : null,
    )
    .filter((x): x is { kind: "builtin" | "custom"; key: string } => !!x);
}
