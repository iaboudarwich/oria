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
 *   • If they have no orgs of that mode (typically: no work spaces yet),
 *     return the create-flow href so the toggle feels actionable rather
 *     than silently no-op.
 *
 * Does NOT redirect server-side — returns `{ ok, href }` so the client can
 * push() to the new route inside a transition. That keeps the switch feeling
 * instant (no server-redirect blocking on a full layout revalidate before
 * the highlight can move).
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

  // No org of the target mode. Work: send to the create flow without touching
  // the cookie (user stays "in" personal until a workspace exists). Personal:
  // clear the cookie so getCurrentContext bootstraps a personal space on the
  // next render.
  if (mode === "work") {
    return { ok: true, href: "/dashboard/work/spaces/new" };
  }
  const store = await cookies();
  store.delete(ACTIVE_SPACE_COOKIE);
  revalidatePath("/dashboard", "layout");
  return { ok: true, href: "/dashboard" };
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
