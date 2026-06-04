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
import { randomUUID } from "node:crypto";

process.loadEnvFile(".env.local");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !SRK || !ANON) {
  console.error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
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
  check("recovery token establishes a session", !!verified.data.session, verified.error?.message ?? "");

  // 4. updateUser against the recovery session actually changes the password.
  const upd = await anon.auth.updateUser({ password: NEW });
  check("updateUser({ password }) succeeds on the recovery session", !upd.error, upd.error?.message ?? "");

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

console.log(`\npassword-reset path: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
