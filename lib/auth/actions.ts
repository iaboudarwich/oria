"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isCommonPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/common-passwords";
import { logAnonAuthFailure, logAuditEvent } from "@/lib/data/audit-log";
import { clearReauth, markReauthenticated } from "@/lib/auth/reauth";
import { trackEvent } from "@/lib/analytics";

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
    // Open the 5-min re-auth window unless MFA is still required;
    // when needsMfa is true the MFA gate is the proof, not this.
    if (!needsMfa) await markReauthenticated(userData.user.id);
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

  // Strong-password gate: at least 12 chars, not a known-common password.
  const tAuth = await getTranslations("auth");
  if (password.length < MIN_PASSWORD_LENGTH) {
    authError("/signup", tAuth("pw_too_short", { min: MIN_PASSWORD_LENGTH }), email, next);
  }
  if (isCommonPassword(password)) {
    authError("/signup", tAuth("pw_too_common"), email, next);
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
    // No session yet means email confirmation is required. Send the user
    // to the dedicated verification screen, which can resend the link.
    const params = new URLSearchParams({ email });
    if (next !== "/dashboard") params.set("next", next);
    redirect(`/auth/verify?${params.toString()}`);
  }

  // Session exists — email was auto-confirmed (e.g. local dev or OTP disabled)
  trackEvent("signup_completed");
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

/**
 * Resend the sign-up confirmation email. Called from /auth/verify. Returns
 * a plain result object (not a redirect) so the client can run a cooldown
 * timer. Never reveals whether the address is registered.
 */
export async function resendSignupEmail(
  email: string,
): Promise<{ ok: boolean }> {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false };
  const supabase = await createClient();
  const callbackUrl = new URL(`${siteUrl()}/auth/callback`);
  // Swallow errors: we always report success to avoid leaking which
  // addresses have pending sign-ups.
  await supabase.auth.resend({
    type: "signup",
    email: trimmed,
    options: { emailRedirectTo: callbackUrl.toString() },
  });
  return { ok: true };
}

/**
 * Start the forgot-password flow. Sends a recovery link that lands on
 * /auth/callback (which exchanges the code for a session) and then
 * forwards to /auth/reset. Always redirects to a neutral confirmation so
 * we never disclose whether an account exists for the address.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) authError("/login", "Email required");

  const supabase = await createClient();
  const redirectTo = new URL(`${siteUrl()}/auth/callback`);
  redirectTo.searchParams.set("next", "/auth/reset");
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectTo.toString(),
  });

  redirect(`/auth/forgot?sent=1&email=${encodeURIComponent(email)}`);
}

/**
 * Complete the forgot-password flow. Requires the recovery session created
 * by the callback. Updates the password, audits it, and bounces to sign-in.
 */
export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    redirect("/auth/reset?error=" + encodeURIComponent("Password must be at least 8 characters."));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/forgot?error=" + encodeURIComponent("Your reset link expired. Request a new one."));
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect("/auth/reset?error=" + encodeURIComponent(error.message));
  }

  await logAuditEvent({
    userId: user.id,
    action: "settings.password.changed",
    metadata: { via: "reset" },
  });

  redirect("/login?notice=" + encodeURIComponent("Password updated. You can sign in now."));
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
  // Clear the re-auth window cookie so a returning user starts fresh.
  await clearReauth();
  // Sign-out lands on /login; the dashboard tree they're leaving doesn't
  // need a revalidation because they can no longer reach it.
  redirect("/login");
}
