"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAnonAuthFailure, logAuditEvent } from "@/lib/data/audit-log";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

// Only allow same-app paths as `next` redirect targets. never an external URL.
function safeNext(value: string | null | undefined): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function authError(
  path: "/login" | "/signup",
  message: string,
  email?: string,
  next?: string,
) {
  const params = new URLSearchParams({ error: message });
  if (email) params.set("email", email);
  if (next) params.set("next", next);
  redirect(`${path}?${params.toString()}`);
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email || !password) {
    authError("/login", "Email and password required", email, next);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Anon failure — we know the email but not a user_id. Log with
    // null user_id; only admins can see these (RLS hides them from
    // the everyone-can-see-their-own-log surface so we don't leak
    // account-existence).
    await logAnonAuthFailure({ email, reason: error.message });
    authError("/login", error.message, email, next);
  }

  // After a valid password, check whether the user has a verified TOTP
  // factor. If so the session is currently AAL1 and we need to gate
  // them through /login/mfa before any dashboard route resolves their
  // actor. The MFA page completes the AAL2 elevation, then bounces to
  // `next`. No change to page-side reads is needed: the session itself
  // is already valid; AAL is metadata Supabase tracks alongside it.
  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const needsMfa =
    aal.data?.nextLevel === "aal2" && aal.data.currentLevel === "aal1";

  // Successful password step is logged here whether MFA follows or not;
  // the MFA gate logs its own success/failure on top.
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    await logAuditEvent({
      userId: userData.user.id,
      action: "auth.signin.success",
      metadata: { method: "password", mfa_required: needsMfa },
    });
  }

  if (needsMfa) {
    const params = new URLSearchParams({ next });
    redirect(`/login/mfa?${params.toString()}`);
  }

  redirect(next);
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email || !password) {
    authError("/signup", "Email and password required", email, next);
  }

  const supabase = await createClient();
  // emailRedirectTo carries `next` through the magic-link flow so a user who
  // signs up from an invite lands back on /invite/[token] after confirming.
  const callbackUrl = new URL(`${siteUrl()}/auth/callback`);
  if (next !== "/dashboard") callbackUrl.searchParams.set("next", next);

  const { error, data } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || null },
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) authError("/signup", error.message, email, next);

  if (!data.session) {
    const params = new URLSearchParams({
      notice: "Check your email to confirm your account.",
      email,
    });
    if (next !== "/dashboard") params.set("next", next);
    redirect(`/login?${params.toString()}`);
  }

  redirect(next);
}

export async function signInWithMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!email) authError("/login", "Email required", undefined, next);

  const supabase = await createClient();
  const callbackUrl = new URL(`${siteUrl()}/auth/callback`);
  if (next !== "/dashboard") callbackUrl.searchParams.set("next", next);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl.toString() },
  });
  if (error) authError("/login", error.message, email, next);

  const params = new URLSearchParams({
    notice: "Check your email for a sign-in link.",
    email,
  });
  if (next !== "/dashboard") params.set("next", next);
  redirect(`/login?${params.toString()}`);
}

export async function signOut() {
  const supabase = await createClient();
  // Audit BEFORE the sign-out call so we still have a session to read
  // user_id from. If the audit insert fails it's swallowed; the actual
  // sign-out below is the load-bearing part.
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    await logAuditEvent({
      userId: userData.user.id,
      action: "auth.signout",
    });
  }
  await supabase.auth.signOut();
  // Sign-out lands on /login; the dashboard tree they're leaving doesn't
  // need a revalidation because they can no longer reach it.
  redirect("/login");
}
