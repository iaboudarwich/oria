import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSpaceCookie } from "./active-space";
import type { Membership, Organization, Profile } from "@/lib/supabase/types";

export type CurrentContext = {
  profile: Profile;
  organization: Organization;
  membership: Membership;
};

export type UserSpace = {
  organization: Organization;
  membership: Membership;
};

/**
 * Returns the signed-in user's profile, active organization (= active space),
 * and the corresponding membership.
 *
 * The active space is chosen as follows:
 *   1. If the `oria_active_org` cookie names an org the user is a member of,
 *      that one is returned.
 *   2. Otherwise the user's first (oldest) membership is returned.
 *
 * Bootstraps a personal space the first time a user lands.
 * Cached per render so multiple server components can call it cheaply.
 */
export const getCurrentContext = cache(async (): Promise<CurrentContext | null> => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Load all memberships so we can both pick the active one and let the
  // sidebar render the full space switcher with no extra round trip.
  const memRes = await supabase
    .from("memberships")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const memberships = (memRes.data ?? []) as Membership[];

  if (memberships.length > 0) {
    const activeCookie = await getActiveSpaceCookie();
    const active =
      (activeCookie &&
        memberships.find((m) => m.organization_id === activeCookie)) ||
      memberships[0];

    const [orgRes, profileRes] = await Promise.all([
      supabase
        .from("organizations")
        .select("*")
        .eq("id", active.organization_id)
        .maybeSingle(),
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    ]);
    const organization = orgRes.data as Organization | null;
    const profile = profileRes.data as Profile | null;
    if (organization && profile) {
      return { profile, organization, membership: active };
    }
  }

  // No membership yet. Bootstrap a personal space.
  const bootstrapped = await bootstrapPersonalSpace(user.id, user.email!);
  if (!bootstrapped) return null;

  return bootstrapped;
});

/**
 * Every space the user belongs to (personal + every circle + future offices).
 * Ordered by creation (personal first).
 */
export async function listUserSpaces(): Promise<UserSpace[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const memRes = await supabase
    .from("memberships")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const memberships = (memRes.data ?? []) as Membership[];
  if (memberships.length === 0) return [];

  const ids = memberships.map((m) => m.organization_id);
  const orgRes = await supabase
    .from("organizations")
    .select("*")
    .in("id", ids);
  const orgs = (orgRes.data ?? []) as Organization[];
  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  return memberships
    .map((m) => {
      const org = orgMap.get(m.organization_id);
      return org ? { membership: m, organization: org } : null;
    })
    .filter((s): s is UserSpace => !!s);
}

async function bootstrapPersonalSpace(
  userId: string,
  email: string,
): Promise<CurrentContext | null> {
  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id: userId,
        email,
      },
      { onConflict: "id" },
    )
    .select()
    .single();
  if (profileError || !profile) return null;

  const localPart = email.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const slug = `${localPart || "space"}-${userId.slice(0, 8)}`;
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      slug,
      name: "Personal",
      kind: "personal",
      created_by: userId,
    })
    .select()
    .single();
  if (orgError || !org) return null;

  const { data: membership, error: memError } = await admin
    .from("memberships")
    .insert({
      organization_id: org.id,
      user_id: userId,
      role: "owner",
    })
    .select()
    .single();
  if (memError || !membership) return null;

  return {
    profile: profile as Profile,
    organization: org as Organization,
    membership: membership as Membership,
  };
}

export async function requireContext(): Promise<CurrentContext> {
  const ctx = await getCurrentContext();
  if (!ctx) {
    throw new Error("Not authenticated or context unavailable");
  }
  return ctx;
}

/**
 * God's Eye gate. The account owner can search across every space they
 * belong to. but only while they're sitting in their Personal space.
 * A Workspace or Circle agent never sees Personal data, and a non-owner
 * (e.g. a future shared-personal-space member) doesn't get this either.
 *
 *   ctx.organization.kind === "personal"   → sitting in Personal
 *   ctx.membership.role === "owner"        → is the account owner
 *
 * Both must be true. Callers that grant cross-space access (Ask Oria's
 * crossSpace flag, the Calendar "Everywhere" toggle) MUST consult this.
 */
export function isAccountOwnerInPersonal(ctx: CurrentContext): boolean {
  return (
    ctx.organization.kind === "personal" && ctx.membership.role === "owner"
  );
}
