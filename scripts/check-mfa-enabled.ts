/**
 * Probe whether TOTP MFA is enabled at the Supabase project level.
 *
 * Supabase doesn't expose a settings-read endpoint via the JS SDK, so
 * we just try the operation that would fail if it were off: create a
 * test user, sign them in, call auth.mfa.enroll(). Result tells us
 * everything:
 *   - success                       → TOTP enrollment is live
 *   - "MFA is not enabled" / 401    → TOTP is OFF in project settings
 *   - "TOTP factor type is not …"   → TOTP specifically is disabled
 *   - other error                   → surface it; treat as inconclusive
 *
 * Cleans up the ephemeral user on success or failure.
 *
 * Run:  npx tsx scripts/check-mfa-enabled.ts
 * Needs: SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL +
 *        NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !ANON || !SR) {
  console.error("Missing env vars in .env.local.");
  process.exit(1);
}

const admin = createClient(URL, SR, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = `mfa-probe-${Date.now()}@example.test`;
  const password = `Pw-${Math.random().toString(36).slice(2)}-X1!`;
  let userId: string | null = null;
  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) {
      console.error("createUser failed:", created.error?.message);
      process.exit(2);
    }
    userId = created.data.user.id;

    const user = createClient(URL, ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signIn = await user.auth.signInWithPassword({ email, password });
    if (signIn.error) {
      console.error("signIn failed:", signIn.error.message);
      process.exit(2);
    }

    const enroll = await user.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "probe",
    });

    if (enroll.error) {
      const msg = enroll.error.message || String(enroll.error);
      console.log("✗ TOTP enrollment returned an error.");
      console.log(`  message: ${msg}`);
      if (/not enabled|disabled|MFA|TOTP/i.test(msg)) {
        console.log(
          "\nLikely cause: TOTP is OFF in Supabase Dashboard → Authentication → Multi-Factor Auth.",
        );
        console.log("Toggle TOTP on, then re-run this script.");
      }
      process.exit(1);
    }

    console.log("✓ TOTP enrollment SUCCEEDED.");
    console.log(`  factor id: ${enroll.data.id}`);
    console.log("  TOTP MFA is enabled at the project level.");

    // Tear down the unverified factor we just created so the test
    // user has nothing dangling before we delete it.
    await user.auth.mfa.unenroll({ factorId: enroll.data.id }).catch(() => {});
  } finally {
    if (userId) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(2);
});
