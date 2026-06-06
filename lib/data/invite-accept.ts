"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_SPACE_COOKIE } from "./active-space";
import { recordSystemEvent } from "./system-events";
import { writeStatusFlash } from "./status-strip";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type InvitePreview = {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_description: string | null;
  email: string;
  display_name: string | null;
  title: string | null;
  access_level: "owner" | "full" | "limited" | "assigned";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  invited_by_name: string | null;
};

export type InvitePreviewByCode = InvitePreview & { token: string };

export type AcceptInviteFailure = "auth" | "missing" | "revoked" | "used" | "expired" | "error";

export type AcceptInviteResult =
  | { ok: true; organizationId: string }
  | { ok: false; reason: AcceptInviteFailure };

/**
 * Read-only preview of an invite by long-form token. Safe to call without
 * being a member of the target org. backed by a SECURITY DEFINER RPC.
 */
export async function previewInvite(token: string): Promise<InvitePreview | null> {
  if (!token) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_invite", {
    p_token: token,
  });
  if (error || !data || data.length === 0) return null;
  return data[0] as InvitePreview;
}

export async function previewInviteByCode(code: string): Promise<InvitePreviewByCode | null> {
  if (!code) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_invite_by_code", {
    p_code: code,
  });
  if (error || !data || data.length === 0) return null;
  return data[0] as InvitePreviewByCode;
}

/**
 * Try to accept an invite for the currently signed-in user. Returns a typed
 * result instead of redirecting so callers (e.g. the /invite/[token] server
 * component running auto-accept) can react inline.
 *
 * On success, also sets the active-space cookie to the joined org so the
 * caller can just `redirect("/dashboard")` and land inside it.
 */
export async function tryAcceptInvite(token: string): Promise<AcceptInviteResult> {
  if (!token) return { ok: false, reason: "missing" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite", {
    p_token: token,
  });

  if (error) {
    const code = error.code;
    let reason: AcceptInviteFailure = "error";
    if (code === "28000") reason = "auth";
    else if (code === "P0002") reason = "missing";
    else if (code === "P0003") reason = "revoked";
    else if (code === "P0004") reason = "used";
    else if (code === "P0005") reason = "expired";
    return { ok: false, reason };
  }

  const orgId = data as string | null;
  if (orgId) {
    const store = await cookies();
    store.set(ACTIVE_SPACE_COOKIE, orgId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });

    // Surface a calm "X joined" status update to the space's other
    // members + a "You joined SpaceName" flash to the joiner themselves.
    // The event reaches existing members via the system_events feed;
    // the flash is a one-shot cookie consumed by the topbar on first
    // render after the redirect. Best-effort. lookup failures fall
    // back to generic copy.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const [profileRes, orgRes] = await Promise.all([
        supabase.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
        supabase.from("organizations").select("name, kind").eq("id", orgId).maybeSingle(),
      ]);
      const profile = profileRes.data as {
        full_name?: string;
        email?: string;
      } | null;
      const org = orgRes.data as { name?: string; kind?: string } | null;
      const name = profile?.full_name ?? profile?.email ?? user.email ?? "Someone";
      const spaceName = org?.name ?? "your new space";

      void recordSystemEvent({
        kind: "invite.accepted",
        severity: "info",
        context: { title: name },
        organizationId: orgId,
        actorId: user.id,
      });
      await writeStatusFlash(`You joined ${spaceName}.`);
    }

    revalidatePath("/dashboard", "layout");
    return { ok: true, organizationId: orgId };
  }

  return { ok: false, reason: "error" };
}

/**
 * Server-action form wrapper. Used by the "Accept and join" button on the
 * invite preview page. Always redirects.
 */
export async function acceptInvite(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) redirect("/invite/code?error=missing");

  const result = await tryAcceptInvite(token);
  if (!result.ok) {
    redirect(`/invite/${token}?error=${result.reason}`);
  }
  redirect("/dashboard");
}

/**
 * Find an invite by its 8-character code and forward to its token-based
 * invite page. Used by /invite/code so the canonical URL contains the token,
 * not the user-typed code (which would otherwise leak into history/logs).
 */
export async function joinByCode(formData: FormData): Promise<void> {
  const raw = String(formData.get("code") ?? "").trim();
  if (!raw) redirect("/invite/code?error=missing");

  const preview = await previewInviteByCode(raw);
  if (!preview) redirect("/invite/code?error=missing");

  redirect(`/invite/${preview!.token}`);
}
