"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { sendInviteEmail, type SendInviteResult } from "@/lib/email/send-invite";
import type { AccessLevel, Invite, Role } from "@/lib/supabase/types";

export type EmailStatus = SendInviteResult["status"];

/**
 * Compact email outcome we hand to the client UI. Carries the reason so
 * the owner sees what actually went wrong (e.g. "Sending domain isn't
 * verified on Resend yet.") rather than the generic banner.
 */
export type EmailOutcome = {
  status: EmailStatus;
  reason?: string;
};

function toOutcome(send: SendInviteResult): EmailOutcome {
  if (send.status === "failed") {
    return { status: "failed", reason: send.reason };
  }
  if (send.status === "skipped") {
    return { status: "skipped" };
  }
  return { status: "sent" };
}

type Result<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

const ALLOWED_INVITE_ROLES: Role[] = [
  "household",
  "assistant",
  "accountant",
  "staff",
  "external",
];

const ALLOWED_INVITE_ACCESS: AccessLevel[] = ["full", "limited", "assigned"];

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseSectionFields(
  formData: FormData,
): { builtin: string[]; custom: string[] } {
  const builtin = formData.getAll("builtin").map(String).filter(Boolean);
  const custom = formData.getAll("custom").map(String).filter(Boolean);
  return { builtin: Array.from(new Set(builtin)), custom: Array.from(new Set(custom)) };
}

/**
 * Create one invite for one person AND email them the link.
 * Returns the full invite row + email send status so the UI can show:
 *   • "Email sent to alex@example.com" on success
 *   • "Email isn't set up yet — share the link directly" on no key
 *   • "Email failed — share the link directly" on transport failure
 */
export async function inviteToCircle(
  formData: FormData,
): Promise<Result<{ invite: Invite; emailOutcome: EmailOutcome }>> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const display_name =
    String(formData.get("display_name") ?? "").trim().slice(0, 80) || null;
  const title = String(formData.get("title") ?? "").trim().slice(0, 40) || null;

  const roleRaw = String(formData.get("role") ?? "household");
  const role = ALLOWED_INVITE_ROLES.includes(roleRaw as Role)
    ? (roleRaw as Role)
    : "household";

  const accessRaw = String(formData.get("access_level") ?? "full");
  const access_level = ALLOWED_INVITE_ACCESS.includes(accessRaw as AccessLevel)
    ? (accessRaw as AccessLevel)
    : "full";

  if (!email || !isEmail(email)) {
    return { ok: false, error: "Enter a valid email" };
  }

  const ctx = await requireContext();
  if (ctx.organization.kind === "personal") {
    return { ok: false, error: "Create a circle before inviting people" };
  }
  if (ctx.membership.role !== "owner") {
    return { ok: false, error: "Only the owner can invite people" };
  }
  if (email === ctx.profile.email.toLowerCase()) {
    return { ok: false, error: "That's already you" };
  }

  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("invites")
    .insert({
      organization_id: ctx.organization.id,
      email,
      display_name,
      title,
      role,
      access_level,
      created_by: ctx.profile.id,
    })
    .select("*")
    .single();

  if (error || !row) {
    if (error?.code === "23505") {
      return { ok: false, error: "There's already an active invite for this email" };
    }
    return { ok: false, error: error?.message ?? "Could not create invite" };
  }

  const invite = row as Invite;

  if (access_level === "limited") {
    const { builtin, custom } = parseSectionFields(formData);
    const rows = [
      ...builtin.map((b) => ({ invite_id: invite.id, builtin_section: b })),
      ...custom.map((c) => ({ invite_id: invite.id, custom_section_id: c })),
    ];
    if (rows.length > 0) {
      await supabase.from("invite_sections").insert(rows);
    }
  }

  const send = await sendInviteEmail({
    toEmail: email,
    toName: display_name,
    inviterName: ctx.profile.full_name?.trim() || ctx.profile.email,
    circleName: ctx.organization.name,
    circleDescription: ctx.organization.description,
    title,
    accessLevel: access_level,
    token: invite.token,
    code: invite.code,
  });

  revalidatePath("/dashboard/circle");
  return { ok: true, data: { invite, emailOutcome: toOutcome(send) } };
}

/**
 * Soft-revoke an invite. Link/code stop working immediately.
 */
export async function revokeInvite(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const ctx = await requireContext();
  if (ctx.membership.role !== "owner") return;

  const supabase = await createClient();
  await supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);

  revalidatePath("/dashboard/circle");
}

/**
 * Generate a brand-new invite for the same recipient. The previous invite is
 * revoked atomically so its link and code stop working immediately. Use this
 * when the link/code may have been seen, mistyped, or leaked — anything that
 * means "I'd like the previous one to stop working but please re-send".
 *
 * Returns the new invite + email status. Recipient sees a fresh link+code.
 */
export async function regenerateInvite(
  formData: FormData,
): Promise<Result<{ invite: Invite; emailOutcome: EmailOutcome }>> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing invite id" };

  const ctx = await requireContext();
  if (ctx.membership.role !== "owner") {
    return { ok: false, error: "Only the owner can refresh invites" };
  }

  const supabase = await createClient();

  // 1. Read the current invite (so we can clone its access settings).
  const { data: existing } = await supabase
    .from("invites")
    .select("*")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .is("accepted_at", null)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "Invite not found or already accepted" };
  }
  const prev = existing as Invite;

  // 2. Mark the old invite revoked. The partial unique index treats it as
  //    inactive once revoked, so the new insert below won't collide.
  const { error: revokeError } = await supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", prev.id);
  if (revokeError) return { ok: false, error: revokeError.message };

  // 3. Create the new invite. Fresh token + code from the db defaults.
  const { data: row, error: insertError } = await supabase
    .from("invites")
    .insert({
      organization_id: ctx.organization.id,
      email: prev.email,
      display_name: prev.display_name,
      title: prev.title,
      role: prev.role,
      access_level: prev.access_level,
      created_by: ctx.profile.id,
    })
    .select("*")
    .single();
  if (insertError || !row) {
    return { ok: false, error: insertError?.message ?? "Could not refresh" };
  }
  const fresh = row as Invite;

  // 4. Copy the section allowlist if this invite is "limited".
  if (prev.access_level === "limited") {
    const { data: oldSections } = await supabase
      .from("invite_sections")
      .select("builtin_section, custom_section_id")
      .eq("invite_id", prev.id);
    const rows = ((oldSections ?? []) as Array<{
      builtin_section: string | null;
      custom_section_id: string | null;
    }>).map((r) => ({
      invite_id: fresh.id,
      builtin_section: r.builtin_section,
      custom_section_id: r.custom_section_id,
    }));
    if (rows.length > 0) {
      await supabase.from("invite_sections").insert(rows);
    }
  }

  // 5. Send the new email.
  const send = await sendInviteEmail({
    toEmail: fresh.email,
    toName: fresh.display_name,
    inviterName: ctx.profile.full_name?.trim() || ctx.profile.email,
    circleName: ctx.organization.name,
    circleDescription: ctx.organization.description,
    title: fresh.title,
    accessLevel: fresh.access_level,
    token: fresh.token,
    code: fresh.code,
  });

  revalidatePath("/dashboard/circle");
  return { ok: true, data: { invite: fresh, emailOutcome: toOutcome(send) } };
}

/**
 * Re-send an invite email and extend the expiry by 14 days. Reuses the
 * existing link + code, so the invitee doesn't need to be told a new one.
 */
export async function resendInvite(
  formData: FormData,
): Promise<Result<{ emailOutcome: EmailOutcome }>> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing invite id" };

  const ctx = await requireContext();
  if (ctx.membership.role !== "owner") {
    return { ok: false, error: "Only the owner can resend invites" };
  }

  const newExpiry = new Date();
  newExpiry.setDate(newExpiry.getDate() + 14);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invites")
    .update({
      expires_at: newExpiry.toISOString(),
      revoked_at: null,
    })
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .is("accepted_at", null)
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not resend" };
  }

  const invite = data as Invite;
  const send = await sendInviteEmail({
    toEmail: invite.email,
    toName: invite.display_name,
    inviterName: ctx.profile.full_name?.trim() || ctx.profile.email,
    circleName: ctx.organization.name,
    circleDescription: ctx.organization.description,
    title: invite.title,
    accessLevel: invite.access_level,
    token: invite.token,
    code: invite.code,
  });

  revalidatePath("/dashboard/circle");
  return { ok: true, data: { emailOutcome: toOutcome(send) } };
}

/**
 * Edit the access level (and section allowlist for "limited") of an invite
 * that hasn't been accepted yet.
 */
export async function updateInviteAccess(
  formData: FormData,
): Promise<Result> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing invite id" };

  const accessRaw = String(formData.get("access_level") ?? "full");
  const access_level = ALLOWED_INVITE_ACCESS.includes(accessRaw as AccessLevel)
    ? (accessRaw as AccessLevel)
    : "full";

  const ctx = await requireContext();
  if (ctx.membership.role !== "owner") {
    return { ok: false, error: "Only the owner can edit invites" };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("invites")
    .update({ access_level })
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .is("accepted_at", null);
  if (error) return { ok: false, error: error.message };

  await supabase.from("invite_sections").delete().eq("invite_id", id);
  if (access_level === "limited") {
    const { builtin, custom } = parseSectionFields(formData);
    const rows = [
      ...builtin.map((b) => ({ invite_id: id, builtin_section: b })),
      ...custom.map((c) => ({ invite_id: id, custom_section_id: c })),
    ];
    if (rows.length > 0) {
      await supabase.from("invite_sections").insert(rows);
    }
  }

  revalidatePath("/dashboard/circle");
  return { ok: true };
}
