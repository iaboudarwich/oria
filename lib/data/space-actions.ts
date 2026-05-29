"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext } from "./organizations";
import { ACTIVE_SPACE_COOKIE } from "./active-space";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "space"
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

async function clearActiveCookie() {
  const store = await cookies();
  store.delete(ACTIVE_SPACE_COOKIE);
}

/**
 * Switch the active space.
 *
 * Privacy-critical: every cached surface must be flushed so the prior
 * org's data can never paint after the switch. We blow away the entire
 * /dashboard subtree via the layout revalidation (Next propagates that
 * to all descendant paths) AND explicitly invalidate the dynamic feeds
 * that hold stale state most often. router.refresh() on the client
 * does the rest of the cache eviction in the browser.
 *
 * Silently no-ops on missing org / non-member.
 */
export type SwitchResult = { ok: true } | { ok: false };

export async function switchSpace(orgId: string): Promise<SwitchResult> {
  const id = orgId.trim();
  if (!id) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("organization_id", id)
    .maybeSingle();
  if (!membership) return { ok: false };

  await setActiveCookie(id);

  // Belt-and-suspenders cache eviction. The layout revalidation alone
  // would propagate, but explicitly nuking the high-leak surfaces makes
  // sure neither RSC cache nor client router cache holds prior-org
  // rows in stale-times window (next.config staleTimes.dynamic = 30s).
  revalidatePath("/dashboard", "layout");
  for (const path of HIGH_LEAK_SURFACES) {
    revalidatePath(path);
  }
  return { ok: true };
}

/**
 * Pages that pre-fetch org-scoped data and most need a fresh render
 * after a switchSpace. The dashboard layout revalidation invalidates
 * descendants too, but listing the hot paths means a stale chunk
 * never survives a soft navigation.
 */
const HIGH_LEAK_SURFACES = [
  "/dashboard",
  "/dashboard/inbox",
  "/dashboard/calendar",
  "/dashboard/reminders",
  "/dashboard/timeline",
  "/dashboard/diet",
  "/dashboard/bills",
  "/dashboard/sections",
  "/dashboard/work",
  "/dashboard/work/finance",
  "/dashboard/work/invoices",
  "/dashboard/work/contracts",
  "/dashboard/work/agent",
  "/dashboard/work/analysis",
  "/dashboard/work/reports",
  "/dashboard/search",
  "/dashboard/ask",
  "/dashboard/circle",
  "/dashboard/private",
  "/dashboard/trash",
];

/**
 * Step 1 of circle creation: create the org + owner membership and hand off
 * to the setup page where people get invited. We switch the active space
 * immediately so the new circle is the user's context while they invite.
 *
 * FormData keys:
 *   - name (required). short label, e.g. "Family", "Roommates"
 *   - description (optional). what this circle is for (used by Oria to
 *     classify uploads + organize reminders into the right circle).
 */
export async function createCircle(formData: FormData): Promise<void> {
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
      kind: "circle",
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
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/circles/${orgRow.id}/setup`);
}

/**
 * Permanently delete a circle and everything in it. Owner only, circles only
 * (personal spaces can't be deleted, they auto-create). Requires the owner
 * to type the circle name as confirmation so it's hard to fire by accident.
 *
 * FormData:
 *   - confirm_name: must match the circle's name exactly (case-insensitive,
 *     trimmed).
 */
export async function deleteCircle(formData: FormData): Promise<void> {
  const confirm = String(formData.get("confirm_name") ?? "").trim();

  const ctx = await requireContext();
  if (ctx.organization.kind !== "circle") return;
  if (ctx.membership.role !== "owner") return;
  if (confirm.toLowerCase() !== ctx.organization.name.trim().toLowerCase()) {
    return;
  }

  const admin = createAdminClient();
  // Cascades delete memberships, invites, uploads, etc. via FK ON DELETE CASCADE.
  await admin.from("organizations").delete().eq("id", ctx.organization.id);

  await clearActiveCookie();
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

/**
 * Leave the active circle. Non-owner: just delete their membership.
 * Owner: refuse if there are other members (they need to transfer ownership
 * first); allow if they're alone (which is degenerate but possible).
 */
export async function leaveCircle(): Promise<void> {
  const ctx = await requireContext();
  if (ctx.organization.kind !== "circle") return;

  const supabase = await createClient();

  if (ctx.membership.role === "owner") {
    // If they're the only member, treat as delete-and-go.
    const { count } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organization.id);
    if ((count ?? 0) > 1) {
      // Refuse silently. UI gates this so the owner shouldn't get here, but
      // we double-check on the server.
      return;
    }
    const admin = createAdminClient();
    await admin
      .from("organizations")
      .delete()
      .eq("id", ctx.organization.id);
  } else {
    await supabase
      .from("memberships")
      .delete()
      .eq("id", ctx.membership.id)
      .eq("organization_id", ctx.organization.id);
  }

  await clearActiveCookie();
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
