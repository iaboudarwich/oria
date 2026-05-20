"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { AccessLevel, Section } from "@/lib/supabase/types";

const ACCESS_LEVELS: AccessLevel[] = ["owner", "full", "limited", "assigned"];

async function ensureOwner(): Promise<{ orgId: string } | null> {
  const ctx = await requireContext();
  if (ctx.membership.role !== "owner") return null;
  return { orgId: ctx.organization.id };
}

/** Change a member's access level. Owner only. Same-org only. */
export async function updateMemberAccess(formData: FormData): Promise<void> {
  const membershipId = String(formData.get("membership_id") ?? "");
  const levelRaw = String(formData.get("access_level") ?? "");
  if (!membershipId) return;
  if (!ACCESS_LEVELS.includes(levelRaw as AccessLevel)) return;
  const level = levelRaw as AccessLevel;

  const owner = await ensureOwner();
  if (!owner) return;

  const supabase = await createClient();
  await supabase
    .from("memberships")
    .update({ access_level: level })
    .eq("id", membershipId)
    .eq("organization_id", owner.orgId);

  // If moving away from 'limited', clear the section allowlist so it doesn't
  // resurface as a stale state next time they're set back to limited.
  if (level !== "limited") {
    await supabase
      .from("membership_sections")
      .delete()
      .eq("membership_id", membershipId);
  }

  revalidatePath("/dashboard/circle");
}

/**
 * Replace the allowlist of sections for a "limited" member. FormData keys:
 *   - membership_id
 *   - builtin (multiple) — built-in section enum values
 *   - custom (multiple)  — custom section UUIDs
 */
export async function setMemberSections(formData: FormData): Promise<void> {
  const membershipId = String(formData.get("membership_id") ?? "");
  if (!membershipId) return;

  const owner = await ensureOwner();
  if (!owner) return;

  const supabase = await createClient();

  // Confirm the membership belongs to this org.
  const memRes = await supabase
    .from("memberships")
    .select("id")
    .eq("id", membershipId)
    .eq("organization_id", owner.orgId)
    .maybeSingle();
  if (!memRes.data) return;

  const builtins = formData
    .getAll("builtin")
    .map((v) => String(v))
    .filter((v) => v.length > 0) as Section[];
  const customs = formData
    .getAll("custom")
    .map((v) => String(v))
    .filter((v) => v.length > 0);

  // Simplest correct path: wipe and reinsert.
  await supabase
    .from("membership_sections")
    .delete()
    .eq("membership_id", membershipId);

  const rows: Array<{
    membership_id: string;
    builtin_section?: Section;
    custom_section_id?: string;
  }> = [
    ...builtins.map((s) => ({
      membership_id: membershipId,
      builtin_section: s,
    })),
    ...customs.map((id) => ({
      membership_id: membershipId,
      custom_section_id: id,
    })),
  ];

  if (rows.length > 0) {
    await supabase.from("membership_sections").insert(rows);
  }

  revalidatePath("/dashboard/circle");
}

/**
 * Set a free-text title on a member ("Property manager", "Lawyer",
 * "Accountant"). Owner only. Permissions are controlled by access_level;
 * the title is for display in Workspaces (and harmless in Personal/Circle).
 *
 * FormData:
 *   - membership_id
 *   - title (may be empty to clear)
 */
export async function setMemberTitle(formData: FormData): Promise<void> {
  const membershipId = String(formData.get("membership_id") ?? "");
  if (!membershipId) return;
  const titleRaw = String(formData.get("title") ?? "").trim().slice(0, 60);
  const title = titleRaw.length > 0 ? titleRaw : null;

  const owner = await ensureOwner();
  if (!owner) return;

  const supabase = await createClient();
  await supabase
    .from("memberships")
    .update({ title })
    .eq("id", membershipId)
    .eq("organization_id", owner.orgId);

  revalidatePath("/dashboard/circle");
}

/** Remove a member from the active circle. Owner only. Cannot remove self. */
export async function removeMember(formData: FormData): Promise<void> {
  const membershipId = String(formData.get("membership_id") ?? "");
  if (!membershipId) return;

  const ctx = await requireContext();
  if (ctx.membership.role !== "owner") return;
  if (membershipId === ctx.membership.id) return; // can't self-remove

  const supabase = await createClient();
  await supabase
    .from("memberships")
    .delete()
    .eq("id", membershipId)
    .eq("organization_id", ctx.organization.id);

  revalidatePath("/dashboard/circle");
}

/**
 * Make another member the owner. Demotes the current owner to a "full"
 * member. Single-owner model. Owner only.
 *
 * FormData:
 *   - membership_id: the target member to promote
 */
export async function transferOwnership(formData: FormData): Promise<void> {
  const targetId = String(formData.get("membership_id") ?? "");
  if (!targetId) return;

  const ctx = await requireContext();
  if (ctx.membership.role !== "owner") return;
  if (targetId === ctx.membership.id) return;

  const supabase = await createClient();

  // Confirm the target is in this circle and isn't already the owner.
  const target = await supabase
    .from("memberships")
    .select("id, user_id, role")
    .eq("id", targetId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!target.data) return;

  // Promote target.
  await supabase
    .from("memberships")
    .update({ role: "owner", access_level: "owner" })
    .eq("id", targetId)
    .eq("organization_id", ctx.organization.id);

  // Demote current owner to full member.
  await supabase
    .from("memberships")
    .update({ role: "household", access_level: "full" })
    .eq("id", ctx.membership.id)
    .eq("organization_id", ctx.organization.id);

  revalidatePath("/dashboard/circle");
}
