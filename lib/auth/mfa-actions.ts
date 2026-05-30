"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, RATE_PRESETS } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/data/audit-log";
import {
  clearBackupCodes,
  consumeBackupCode,
  markEnrolled,
  markUnenrolled,
  readMfaStatus,
  rotateBackupCodes,
  type BackupCodePlaintext,
} from "./mfa";

/**
 * Server actions for the Settings → Security MFA flows.
 *
 * Enrollment is two-step:
 *   1. enrollStart → creates a Supabase mfa_factor (status=unverified),
 *      returns the QR code data URL + secret for the user to add to
 *      their authenticator app.
 *   2. enrollVerify → user types the 6-digit TOTP from their app; if
 *      it matches, the factor flips to status=verified, we generate
 *      and return 10 backup codes plus stamp profiles.mfa_enrolled_at.
 *      The plaintexts are SHOWN ONCE and never persisted in plaintext.
 *
 * Disabling requires the current TOTP code (or backup code) AND the
 * account password; see disable() below. This is a sensitive change
 * — we treat it as re-auth-equivalent.
 *
 * Sign-in MFA gate (verifyAtSignIn) lives here so the rate-limit
 * preset stays alongside the rest of the MFA surface.
 */

type ActionOk<T> = T extends undefined
  ? { ok: true }
  : { ok: true } & T;
type ActionErr = { ok: false; error: string };
type ActionResult<T = undefined> = ActionOk<T> | ActionErr;

/* ------------------------------------------------------------------ */
/* Enrollment                                                          */
/* ------------------------------------------------------------------ */

export async function enrollStart(): Promise<
  ActionResult<{ factorId: string; qrCode: string; secret: string }>
> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  // If the user already has an UNVERIFIED factor lingering (they
  // started enrollment, never finished), tear it down and start fresh.
  // listFactors returns both verified and unverified. we never touch
  // a verified factor here (that would silently disable 2FA).
  // Treat SDK rows opaquely so a status-literal narrowing change in a
  // future @supabase/supabase-js version doesn't break the build.
  type Factor = { id: string; status: string };
  const factors = await supabase.auth.mfa.listFactors();
  const totpFactors = (factors.data?.totp ?? []) as Factor[];
  for (const f of totpFactors) {
    if (f.status !== "verified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Authenticator app",
  });
  if (error || !data) return { ok: false, error: error?.message ?? "Enroll failed" };

  return {
    ok: true,
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

export async function enrollVerify(
  formData: FormData,
): Promise<ActionResult<{ backupCodes: BackupCodePlaintext[] }>> {
  const factorId = String(formData.get("factor_id") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  if (!factorId || !/^\d{6}$/.test(code)) {
    return { ok: false, error: "Enter the 6-digit code from your authenticator app." };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Not signed in" };

  // Rate-limit the verify attempts so a thief who has the password but
  // not the device can't brute-force the 6-digit code in real time.
  const burst = rateLimit({
    key: `mfa-enroll:${userData.user.id}`,
    ...RATE_PRESETS.mfaVerify(),
  });
  if (!burst.ok) return { ok: false, error: burst.message };

  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    return { ok: false, error: challenge.error?.message ?? "Challenge failed" };
  }
  const verify = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verify.error) {
    return { ok: false, error: "That code didn't match. Try again." };
  }

  // Now the factor is verified. Mint backup codes + stamp the profile.
  const backupCodes = await rotateBackupCodes(userData.user.id);
  await markEnrolled(userData.user.id);
  await logAuditEvent({
    userId: userData.user.id,
    action: "mfa.enrolled",
    metadata: { factor_id: factorId },
  });
  return { ok: true, backupCodes };
}

/* ------------------------------------------------------------------ */
/* Disable                                                             */
/* ------------------------------------------------------------------ */

/**
 * Disable 2FA. Requires:
 *   - The user's current password (re-auth proof).
 *   - A current TOTP code OR an unused backup code (so a stolen
 *     session can't disable MFA without the second factor).
 *
 * On success: unenroll the factor in Supabase, clear backup codes,
 * clear profiles.mfa_enrolled_at.
 */
export async function disable(
  formData: FormData,
): Promise<ActionResult> {
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (!password || !code) {
    return { ok: false, error: "Password and current code (or backup code) required." };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user || !userData.user.email) {
    return { ok: false, error: "Not signed in" };
  }

  const burst = rateLimit({
    key: `mfa-disable:${userData.user.id}`,
    ...RATE_PRESETS.mfaVerify(),
  });
  if (!burst.ok) return { ok: false, error: burst.message };

  // Re-auth via password.
  const pw = await supabase.auth.signInWithPassword({
    email: userData.user.email,
    password,
  });
  if (pw.error) return { ok: false, error: "Password didn't match." };

  // Verify the second factor.
  const status = await readMfaStatus();
  if (!status.factorId) {
    return { ok: false, error: "No active 2FA factor." };
  }
  const ok = await verifyTotpOrBackup({
    userId: userData.user.id,
    factorId: status.factorId,
    code,
    supabase,
  });
  if (!ok) return { ok: false, error: "Code didn't match." };

  // Tear down. Order matters: unenroll first so the auth side is
  // authoritative even if the app-side delete fails (the codes are
  // useless without a factor).
  await supabase.auth.mfa.unenroll({ factorId: status.factorId });
  await clearBackupCodes(userData.user.id);
  await markUnenrolled(userData.user.id);
  await logAuditEvent({
    userId: userData.user.id,
    action: "mfa.disabled",
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Sign-in gate                                                        */
/* ------------------------------------------------------------------ */

/**
 * Called from /login/mfa when the user types their 6-digit (or backup)
 * code after a successful password sign-in. Elevates the session from
 * aal1 → aal2 on success. On failure, ticks the rate limiter — five
 * misses in 15 minutes locks the surface.
 */
export async function verifyAtSignIn(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim();
  const next = String(formData.get("next") ?? "/dashboard");
  const safeNext = next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/dashboard";

  if (!code) {
    redirect(`/login/mfa?error=${encodeURIComponent("Enter your 6-digit code.")}&next=${encodeURIComponent(safeNext)}`);
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const burst = rateLimit({
    key: `mfa-signin:${userData.user.id}`,
    ...RATE_PRESETS.mfaVerify(),
  });
  if (!burst.ok) {
    redirect(`/login/mfa?error=${encodeURIComponent(burst.message)}&next=${encodeURIComponent(safeNext)}`);
  }

  const status = await readMfaStatus();
  if (!status.factorId) redirect(safeNext); // shouldn't happen — guard

  const ok = await verifyTotpOrBackup({
    userId: userData.user.id,
    factorId: status.factorId,
    code,
    supabase,
  });
  if (!ok) {
    await logAuditEvent({
      userId: userData.user.id,
      action: "auth.signin.mfa.failure",
    });
    redirect(
      `/login/mfa?error=${encodeURIComponent("Code didn't match. Try again.")}&next=${encodeURIComponent(safeNext)}`,
    );
  }

  await logAuditEvent({
    userId: userData.user.id,
    action: "auth.signin.mfa.success",
    metadata: { method: /^\d{6}$/.test(code) ? "totp" : "backup_code" },
  });
  redirect(safeNext);
}

/* ------------------------------------------------------------------ */
/* Shared verify (TOTP first, backup code fallback)                    */
/* ------------------------------------------------------------------ */

type VerifyInput = {
  userId: string;
  factorId: string;
  code: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

/**
 * Try the input as a 6-digit TOTP first (cheap, fastest path). If it
 * doesn't look like 6 digits, treat it as a backup code. If TOTP fails
 * but the shape could be a backup code, fall back to consuming one.
 */
async function verifyTotpOrBackup(input: VerifyInput): Promise<boolean> {
  const trimmed = input.code.trim();
  const looksTotp = /^\d{6}$/.test(trimmed);
  const looksBackup = /^[a-z2-7]{5}-?[a-z2-7]{5}$/i.test(trimmed);

  if (looksTotp) {
    const challenge = await input.supabase.auth.mfa.challenge({
      factorId: input.factorId,
    });
    if (challenge.data) {
      const verify = await input.supabase.auth.mfa.verify({
        factorId: input.factorId,
        challengeId: challenge.data.id,
        code: trimmed,
      });
      if (!verify.error) return true;
    }
    // Fall through to backup attempt if it ALSO matches that shape
    // (very rare — 6 digits doesn't match the backup-code regex above).
  }

  if (looksBackup) {
    return await consumeBackupCode(input.userId, trimmed);
  }

  return false;
}
