"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCommonPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/common-passwords";
import { logAnonAuthFailure, logAuditEvent } from "@/lib/data/audit-log";
import { clearReauth, markReauthenticated } from "@/lib/auth/reauth";
import { isTrustedDevice } from "@/lib/auth/trusted-device";
import { sendPasswordResetEmail } from "@/lib/email/send-password-reset";
import { rateLimit } from "@/lib/rate-limit";
import { trackEvent } from "@/lib/analytics";

/**
 * Where a recovery link should land. On a Vercel preview we use the deployment's
 * own origin so the link works on that preview; production and dev use the
 * configured site URL. (The chosen origin must be in Supabase's Auth Redirect
 * URLs allow-list; see the round report.)
 */
function resetRedirectUrl(): string {
  const base =
    process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : siteUrl();
  return `${base.replace(/\/$/, "")}/auth/reset`;
}

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
    // Anon failure: we know the email but not a user_id. Log with
    // null user_id; only admins can see these (RLS hides them from
    // the everyone-can-see-their-own-log surface so we don't leak
    // account-existence).
    await logAnonAuthFailure({ email, reason: error.message });
    authError("/login", error.message, email, next);
  }

  // After a valid password, check whether the user has a verified second
  // factor (session is AAL1). If so we'd gate them through /login/mfa, UNLESS
  // this is a device they've already verified and chosen to trust: a trusted
  // device skips the second-factor step (Round 16.7), so everyday returning
  // logins land straight in.
  const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const hasSecondFactor =
    aal.data?.nextLevel === "aal2" && aal.data.currentLevel === "aal1";

  // Successful password step is logged here whether MFA follows or not;
  // the MFA gate logs its own success/failure on top.
  const { data: userData } = await supabase.auth.getUser();
  const trusted =
    hasSecondFactor && userData.user ? await isTrustedDevice(userData.user.id) : false;
  const needsMfa = hasSecondFactor && !trusted;
  if (userData.user) {
    await logAuditEvent({
      userId: userData.user.id,
      action: "auth.signin.success",
      metadata: { method: "password", mfa_required: needsMfa, trusted_device: trusted },
    });
    // Open the 5-min re-auth window unless the second factor is still required;
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

  // Session exists: email was auto-confirmed (e.g. local dev or OTP disabled)
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
 * Start the forgot-password flow. Mints a recovery link with the admin API and
 * delivers it through our branded Resend email (not Supabase's default SMTP).
 * Returns a plain result so the client can drive the pending / success / rate-
 * limit states. ALWAYS neutral: we never disclose whether the address exists.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ ok: boolean; rateLimited?: boolean; retryAfterSeconds?: number }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return { ok: false };

  // Burst guard per address so repeated clicks can't spam a mailbox; friendly,
  // never a raw provider error.
  const rl = rateLimit({
    key: `pwreset:${trimmed}`,
    limit: 3,
    windowMs: 15 * 60 * 1000,
    label: "password reset",
  });
  if (!rl.ok) return { ok: false, rateLimited: true, retryAfterSeconds: rl.retryAfterSeconds };

  const admin = createAdminClient();
  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: trimmed,
      options: { redirectTo: resetRedirectUrl() },
    });
    // generateLink errors for an unknown address; swallow so the response is the
    // same whether or not the account exists.
    const actionLink = data?.properties?.action_link;
    if (!error && actionLink) {
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("email", trimmed)
        .maybeSingle();
      await sendPasswordResetEmail({
        toEmail: trimmed,
        toName: (profile as { full_name: string | null } | null)?.full_name ?? null,
        resetUrl: actionLink,
      });
    }
  } catch {
    // Never surface a cause; the response stays neutral.
  }
  return { ok: true };
}

/**
 * Record the audited password change after the client has updated it against
 * the recovery session. The browser established the session from the recovery
 * token, so its cookies are present and getUser resolves here.
 */
export async function recordPasswordReset(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  await logAuditEvent({
    userId: user.id,
    action: "settings.password.changed",
    metadata: { via: "reset" },
  });
  return { ok: true };
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
