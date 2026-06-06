#!/usr/bin/env node
/**
 * Proves the password-reset core path without needing to receive an email:
 * recovery token (the same OTP the email link carries) -> session ->
 * updateUser -> the password is ACTUALLY changed. Uses an isolated temp user
 * created and deleted by the admin API, so nothing real is touched.
 *
 * Run: node scripts/verify-password-reset.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHmac } from "node:crypto";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Decode an RFC 4648 base32 secret (the shape Supabase returns at enrollment). */
function base32Decode(s) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of s.replace(/=+$/, "").toUpperCase()) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Compute the current 6-digit TOTP for a base32 secret (what an auth app shows). */
function totp(secret, time = Date.now()) {
  const key = base32Decode(secret);
  let counter = Math.floor(time / 1000 / 30);
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    buf[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 1000000).padStart(6, "0");
}

/** A code different from `avoid` (the provider rejects reusing the same code
 *  within its window), waiting for the next 30s step if needed. */
async function freshCode(secret, avoid) {
  for (let i = 0; i < 32; i++) {
    const c = totp(secret);
    if (c !== avoid) return c;
    await sleep(1100);
  }
  return totp(secret);
}

process.loadEnvFile(".env.local");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !SRK || !ANON) {
  console.error(
    "Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY)",
  );
  process.exit(1);
}

const admin = createClient(URL, SRK, { auth: { persistSession: false } });
const email = `pwreset-test-${randomUUID().slice(0, 8)}@example.com`;
const OLD = "OldPassword-" + randomUUID().slice(0, 8);
const NEW = "NewPassword-" + randomUUID().slice(0, 8);

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
  if (ok) pass++;
  else fail++;
}

let userId = null;
try {
  // 1. Create an isolated, confirmed test user.
  const created = await admin.auth.admin.createUser({ email, password: OLD, email_confirm: true });
  userId = created.data.user?.id ?? null;
  check("temp user created", !!userId);

  // 2. Mint a recovery link/OTP (exactly what requestPasswordReset does).
  const link = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: "https://heyoria.com/auth/reset" },
  });
  const otp = link.data?.properties?.email_otp;
  const actionLink = link.data?.properties?.action_link;
  check("recovery link minted (action_link + otp present)", !!otp && !!actionLink);

  // 3. Recovery token -> session (the link's effect, done server-side here).
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const verified = await anon.auth.verifyOtp({ email, token: otp, type: "recovery" });
  check(
    "recovery token establishes a session",
    !!verified.data.session,
    verified.error?.message ?? "",
  );

  // 4. updateUser against the recovery session actually changes the password.
  const upd = await anon.auth.updateUser({ password: NEW });
  check(
    "updateUser({ password }) succeeds on the recovery session",
    !upd.error,
    upd.error?.message ?? "",
  );

  // 5. The NEW password now signs in; the OLD one no longer does.
  const fresh = createClient(URL, ANON, { auth: { persistSession: false } });
  const newLogin = await fresh.auth.signInWithPassword({ email, password: NEW });
  check("new password signs in", !!newLogin.data.session, newLogin.error?.message ?? "");

  const stale = createClient(URL, ANON, { auth: { persistSession: false } });
  const oldLogin = await stale.auth.signInWithPassword({ email, password: OLD });
  check("old password no longer works", !oldLogin.data.session && !!oldLogin.error);
} catch (e) {
  check("no unexpected error", false, e instanceof Error ? e.message : String(e));
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    console.log("cleaned up temp user");
  }
}

// ── Scenario 2: reset on an account that has a second factor ──────────────────
// Proves the Part 1 fix: with an authentication app enrolled, the recovery
// session starts un-elevated, the provider blocks the password change, and the
// 6-digit code elevates the session so the change then succeeds.
console.log("\n--- second-factor scenario ---");
const email2 = `pwreset-2fa-${randomUUID().slice(0, 8)}@example.com`;
const OLD2 = "OldPassword-" + randomUUID().slice(0, 8);
const NEW2 = "NewPassword-" + randomUUID().slice(0, 8);
let userId2 = null;
try {
  // 1. Confirmed user.
  const created = await admin.auth.admin.createUser({
    email: email2,
    password: OLD2,
    email_confirm: true,
  });
  userId2 = created.data.user?.id ?? null;
  check("temp user (2fa) created", !!userId2);

  // 2. Sign in with the password, then enroll + verify an authentication app
  //    so the account has a real verified second factor.
  const setup = createClient(URL, ANON, { auth: { persistSession: false } });
  await setup.auth.signInWithPassword({ email: email2, password: OLD2 });
  const enroll = await setup.auth.mfa.enroll({ factorType: "totp" });
  const factorId = enroll.data?.id ?? null;
  const secret = enroll.data?.totp?.secret ?? null;
  check("authentication app enrolled", !!factorId && !!secret, enroll.error?.message ?? "");
  const enrollCode = totp(secret);
  const ch0 = await setup.auth.mfa.challenge({ factorId });
  const v0 = await setup.auth.mfa.verify({ factorId, challengeId: ch0.data?.id, code: enrollCode });
  check(
    "authentication app verified (account now has a second factor)",
    !v0.error,
    v0.error?.message ?? "",
  );

  // 3. Recovery token -> a fresh recovery session (the reset link's effect).
  const link = await admin.auth.admin.generateLink({
    type: "recovery",
    email: email2,
    options: { redirectTo: "https://heyoria.com/auth/reset" },
  });
  const otp = link.data?.properties?.email_otp;
  const recovery = createClient(URL, ANON, { auth: { persistSession: false } });
  const verified = await recovery.auth.verifyOtp({ email: email2, token: otp, type: "recovery" });
  check(
    "recovery token establishes a session",
    !!verified.data.session,
    verified.error?.message ?? "",
  );

  // 4. The bug: without elevation the provider refuses the password change.
  const blocked = await recovery.auth.updateUser({ password: NEW2 });
  check(
    "password change is blocked until the second factor is verified",
    !!blocked.error,
    blocked.error?.message ?? "(no error)",
  );

  // 5. The fix: detect the verified factor on the recovery session.
  const aal = await recovery.auth.mfa.getAuthenticatorAssuranceLevel();
  const factors = await recovery.auth.mfa.listFactors();
  const verifiedTotp = (factors.data?.totp ?? []).filter((f) => f.status === "verified");
  check(
    "second factor detected on the recovery session",
    aal.data?.currentLevel === "aal1" && aal.data?.nextLevel === "aal2" && verifiedTotp.length >= 1,
    `current=${aal.data?.currentLevel} next=${aal.data?.nextLevel} verified=${verifiedTotp.length}`,
  );

  // 6. Verify the 6-digit code to elevate the recovery session.
  const code = await freshCode(secret, enrollCode);
  const ch1 = await recovery.auth.mfa.challenge({ factorId: verifiedTotp[0].id });
  const v1 = await recovery.auth.mfa.verify({
    factorId: verifiedTotp[0].id,
    challengeId: ch1.data?.id,
    code,
  });
  check("the 6-digit code elevates the recovery session", !v1.error, v1.error?.message ?? "");

  // 7. Now the password change succeeds, and the new password signs in.
  const upd = await recovery.auth.updateUser({ password: NEW2 });
  check("updateUser({ password }) now succeeds", !upd.error, upd.error?.message ?? "");

  const fresh = createClient(URL, ANON, { auth: { persistSession: false } });
  const newLogin = await fresh.auth.signInWithPassword({ email: email2, password: NEW2 });
  check(
    "new password signs in (2fa account)",
    !!newLogin.data.session,
    newLogin.error?.message ?? "",
  );
} catch (e) {
  check("no unexpected error (2fa)", false, e instanceof Error ? e.message : String(e));
} finally {
  if (userId2) {
    await admin.auth.admin.deleteUser(userId2).catch(() => {});
    console.log("cleaned up temp user (2fa)");
  }
}

console.log(`\npassword-reset path: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
