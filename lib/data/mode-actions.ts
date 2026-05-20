"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_SPACE_COOKIE } from "./active-space";
import { requireContext } from "./organizations";
import { kindsForMode, type Mode } from "./mode";
import type { OrgKind } from "@/lib/supabase/types";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "workspace"
  );
}

async function setActiveCookie(orgId: string) {
  const store = await cookies();
  store.set(ACTIVE_SPACE_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
}

/**
 * Flip the user's active mode (Personal or Work). Strategy:
 *   • Find the most-recently-joined org of the target mode and activate it.
 *   • If they have no orgs of that mode (typically: no work spaces yet),
 *     send them to the create flow so the toggle feels actionable rather
 *     than silently no-op.
 */
export async function switchMode(formData: FormData): Promise<void> {
  const raw = String(formData.get("mode") ?? "").trim();
  if (raw !== "personal" && raw !== "work") return;
  const mode: Mode = raw;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: membershipRows } = await supabase
    .from("memberships")
    .select("organization_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const memberships = (membershipRows ?? []) as Array<{
    organization_id: string;
    created_at: string;
  }>;

  let target: string | null = null;
  if (memberships.length > 0) {
    const orgIds = memberships.map((m) => m.organization_id);
    const { data: orgRows } = await supabase
      .from("organizations")
      .select("id, kind")
      .in("id", orgIds);
    const orgs = (orgRows ?? []) as Array<{ id: string; kind: OrgKind }>;
    const kindSet = new Set(kindsForMode(mode));
    // Walk memberships newest-first; pick the first org of the target mode.
    for (const m of memberships) {
      const org = orgs.find((o) => o.id === m.organization_id);
      if (org && kindSet.has(org.kind)) {
        target = m.organization_id;
        break;
      }
    }
  }

  if (target) {
    await setActiveCookie(target);
    revalidatePath("/", "layout");
    redirect(mode === "work" ? "/dashboard/work" : "/dashboard");
  }

  // No org of the target mode yet. For work, send to the create flow.
  // For personal, the personal-space bootstrap in getCurrentContext will
  // create one on first hit — just clear the cookie and land on /dashboard.
  if (mode === "work") {
    redirect("/dashboard/work/spaces/new");
  }
  const store = await cookies();
  store.delete(ACTIVE_SPACE_COOKIE);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Create a new Work space (org with kind=office) and switch into it.
 *
 *   - name (required): "Office Building A", "Parking Revenue", "Property X"
 *   - description (optional): one or two sentences describing the space.
 */
export async function createWorkSpace(formData: FormData): Promise<void> {
  const rawName = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!rawName) return;

  const description =
    String(formData.get("description") ?? "")
      .trim()
      .slice(0, 280) || null;

  const ctx = await requireContext();
  const admin = createAdminClient();

  const slug = `${slugify(rawName)}-${crypto.randomUUID().slice(0, 6)}`;

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      slug,
      name: rawName,
      kind: "office",
      description,
      created_by: ctx.profile.id,
    })
    .select()
    .single();
  if (orgError || !org) return;

  const orgRow = org as { id: string };

  await admin.from("memberships").insert({
    organization_id: orgRow.id,
    user_id: ctx.profile.id,
    role: "owner",
  });

  await setActiveCookie(orgRow.id);
  revalidatePath("/", "layout");
  redirect("/dashboard/work");
}
