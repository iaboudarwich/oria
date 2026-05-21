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

export type SwitchModeResult =
  | { ok: true; href: string }
  | { ok: false };

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
 *   • If they have no orgs of that mode, AUTO-BOOTSTRAP a private one and
 *     drop them inside it. Personal already worked this way; Work used to
 *     force the user through the setup form on first use, which felt
 *     heavier than Personal for no good reason.
 *
 * The mental model:
 *   • Personal = your private personal space + optional Circles you join.
 *   • Work     = your private Work area + optional Workspaces you create
 *                (Office Building A, Investment X, etc.).
 *
 * Does NOT redirect server-side — returns `{ ok, href }` so the client can
 * push() to the new route inside a transition. That keeps the switch
 * feeling instant.
 */
export async function switchMode(mode: Mode): Promise<SwitchModeResult> {
  if (mode !== "personal" && mode !== "work") return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

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
    revalidatePath("/dashboard", "layout");
    return {
      ok: true,
      href: mode === "work" ? "/dashboard/work" : "/dashboard",
    };
  }

  // No org of the target mode yet — bootstrap one so the user lands in a
  // real space, not a setup form. Personal was already auto-bootstrapped
  // inside getCurrentContext; we mirror it for Work here.
  if (mode === "work") {
    const newOrgId = await bootstrapPrivateWorkSpace(user.id);
    if (newOrgId) {
      await setActiveCookie(newOrgId);
      revalidatePath("/dashboard", "layout");
      return { ok: true, href: "/dashboard/work" };
    }
    // Bootstrap somehow failed (DB error). Fall back to the named-setup
    // flow rather than silently no-op so the user has a path forward.
    return { ok: true, href: "/dashboard/work/spaces/new" };
  }

  // Personal: clear the cookie so getCurrentContext bootstraps a personal
  // space on the next render.
  const store = await cookies();
  store.delete(ACTIVE_SPACE_COOKIE);
  revalidatePath("/dashboard", "layout");
  return { ok: true, href: "/dashboard" };
}

/**
 * Mint a private Work org named "Work" for the user, owner role. The same
 * shape every named Workspace uses (kind=office) — we just default the
 * name and skip the description form. Returns the new org id or null
 * on failure. Best-effort; the caller falls back to the named-setup
 * flow if this returns null.
 */
async function bootstrapPrivateWorkSpace(
  userId: string,
): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const slug = `work-${userId.slice(0, 8)}`;
    const { data: org, error } = await admin
      .from("organizations")
      .insert({
        slug,
        name: "Work",
        kind: "office",
        description: "Your private Work area",
        created_by: userId,
      })
      .select()
      .single();
    if (error || !org) return null;
    const orgRow = org as { id: string };
    await admin.from("memberships").insert({
      organization_id: orgRow.id,
      user_id: userId,
      role: "owner",
    });
    return orgRow.id;
  } catch {
    return null;
  }
}

/**
 * Create a new Workspace (org with kind=office) and switch into it.
 *
 * FormData keys (all from the Work setup form):
 *   - name (required): "Office Building A", "Parking Revenue", "Investment X"
 *   - purpose (optional): single value — "Business", "Property", "Investment",
 *     "Company", "Project", "Other".
 *   - stores (optional): multi-value — "Invoices", "Leases", "Rent",
 *     "Expenses", "Contracts", "Reports".
 *
 * Purpose + stores are folded into the existing `description` text column so
 * the AI extractor + classifier can use them as Workspace context. No
 * schema change required.
 */
export async function createWorkSpace(formData: FormData): Promise<void> {
  const rawName = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!rawName) return;

  const purpose = String(formData.get("purpose") ?? "").trim().slice(0, 40);
  const stores = formData
    .getAll("stores")
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, 8);

  const descParts: string[] = [];
  if (purpose) descParts.push(`Purpose: ${purpose}.`);
  if (stores.length > 0) descParts.push(`Stores: ${stores.join(", ")}.`);
  const description = descParts.length > 0 ? descParts.join(" ").slice(0, 280) : null;

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
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/work");
}
