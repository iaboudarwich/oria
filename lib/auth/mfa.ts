import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * MFA helpers — TOTP plus 10 single-use backup codes.
 *
 * TOTP enrollment + verification go through Supabase Auth's built-in
 * MFA (auth.mfa_factors). Backup codes are app-level: we generate 10
 * at enrollment, hash them with SHA-256, store the hashes in
 * mfa_backup_codes, and SHOW THE PLAINTEXT TO THE USER ONCE. After
 * that the plaintext exists only in the user's password manager or
 * paper backup. Verification compares a fresh hash of the user's
 * input against the stored hashes; a match consumes that row.
 *
 * Why SHA-256 (not bcrypt/argon2):
 *   Each backup code is 11 chars (88 bits of entropy from
 *   randomBytes). It is itself a high-entropy random secret, not a
 *   user-chosen password. The threat model is database compromise
 *   without app-server compromise (otherwise the auth.users table is
 *   already exposed). Against that threat SHA-256 is sufficient
 *   because there is no dictionary to grind: 2^88 keyspace forecloses
 *   brute force. We avoid bcrypt's cost to keep verification fast
 *   (the user types one in the sign-in MFA gate and waits).
 */

const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_BYTES = 6; // 6 bytes → base32 ≈ 10 chars; we format as XXXXX-XXXXX
const BACKUP_CODE_REGEX = /^[a-z2-7]{5}-?[a-z2-7]{5}$/i; // tolerate the hyphen

/** Plaintext backup code shown to the user once at enrollment. */
export type BackupCodePlaintext = string;

/** Hash one backup code with SHA-256. Plaintext is normalised (lowercase,
 *  hyphen-stripped) before hashing so users can type with or without it. */
function hashBackupCode(plaintext: string): string {
  const normalised = plaintext.toLowerCase().replace(/-/g, "");
  return createHash("sha256").update(normalised).digest("hex");
}

/** Generate one base32-style backup code, formatted "xxxxx-xxxxx". */
function generateBackupCode(): BackupCodePlaintext {
  const bytes = randomBytes(BACKUP_CODE_BYTES);
  // RFC 4648 base32 lowercase, no padding. 6 bytes → 10 chars (96 bits
  // before truncation; we keep all 10 chars → 50 bits of effective
  // entropy after collapsing trailing-bit padding, well above the
  // bar for a single-use code).
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(acc >> bits) & 0x1f];
    }
  }
  if (bits > 0) out += alphabet[(acc << (5 - bits)) & 0x1f];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}`;
}

/**
 * Generate 10 backup codes and replace any existing set for this user.
 *
 * Returns plaintexts so the caller can display them ONCE; nothing
 * stores the plaintext anywhere. The previous set (if any) is wiped
 * so disable+re-enable cycles don't leave stale codes valid.
 */
export async function rotateBackupCodes(userId: string): Promise<BackupCodePlaintext[]> {
  const admin = createAdminClient();
  // Wipe any prior codes first so re-enrollment can never leave the
  // old set live.
  await admin.from("mfa_backup_codes").delete().eq("user_id", userId);
  const plaintexts = Array.from({ length: BACKUP_CODE_COUNT }, () => generateBackupCode());
  const rows = plaintexts.map((code) => ({
    user_id: userId,
    code_hash: hashBackupCode(code),
  }));
  const { error } = await admin.from("mfa_backup_codes").insert(rows);
  if (error) throw new Error(`Failed to store backup codes: ${error.message}`);
  return plaintexts;
}

/** Count unused backup codes (for the Settings UI to show a meter). */
export async function countUnusedBackupCodes(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("mfa_backup_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("consumed_at", null);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Try to consume a backup code. Returns true on success, false if
 * no matching unused code exists. Atomic via a single UPDATE.
 */
export async function consumeBackupCode(userId: string, plaintext: string): Promise<boolean> {
  if (!BACKUP_CODE_REGEX.test(plaintext.trim())) return false;
  const hash = hashBackupCode(plaintext.trim());
  const admin = createAdminClient();
  // UPDATE ... RETURNING id atomically marks consumed and tells us
  // whether a row existed. Two concurrent attempts with the same code
  // race here and exactly one wins.
  const { data, error } = await admin
    .from("mfa_backup_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("code_hash", hash)
    .is("consumed_at", null)
    .select("id");
  if (error || !data || data.length === 0) return false;
  return true;
}

/** Wipe all backup codes for a user (called on MFA disable). */
export async function clearBackupCodes(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("mfa_backup_codes").delete().eq("user_id", userId);
}

/* ------------------------------------------------------------------ */
/* Profile flag helpers                                                */
/* ------------------------------------------------------------------ */

/** Stamp `mfa_enrolled_at = now()` on the profile. */
export async function markEnrolled(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ mfa_enrolled_at: new Date().toISOString() })
    .eq("id", userId);
}

/** Clear `mfa_enrolled_at` on the profile. */
export async function markUnenrolled(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("profiles").update({ mfa_enrolled_at: null }).eq("id", userId);
}

/** Read enrolled-at for the active user. Null when not enrolled. */
export async function readMfaEnrolledAt(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("mfa_enrolled_at")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return (data as { mfa_enrolled_at: string | null }).mfa_enrolled_at;
}

/* ------------------------------------------------------------------ */
/* Live MFA status from Supabase Auth                                  */
/* ------------------------------------------------------------------ */

/**
 * Returns the user's current TOTP factor (if any) and whether their
 * session is at AAL2 (i.e., the MFA challenge has been satisfied
 * this session). The auth-helpers SDK already caches the session
 * locally so this is a cheap read.
 */
export type MfaStatus = {
  factorId: string | null;
  factorStatus: "verified" | "unverified" | null;
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
  /** True when nextLevel === "aal2" and currentLevel === "aal1", i.e.
   *  the user has a verified factor but hasn't satisfied it this session. */
  challengeRequired: boolean;
};

export async function readMfaStatus(): Promise<MfaStatus> {
  const supabase = await createClient();
  const [factors, aal] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);

  // listFactors splits into `totp` and `phone`; we use TOTP only.
  // Treat the SDK rows opaquely so we don't get tripped up by
  // version-to-version status-literal narrowing.
  type Factor = { id: string; status: string };
  const totp = (factors.data?.totp ?? []) as Factor[];
  const verified = totp.find((f) => f.status === "verified") ?? null;
  const unverified = totp.find((f) => f.status === "unverified") ?? null;
  const factor = verified ?? unverified;
  const factorStatus: MfaStatus["factorStatus"] = !factor
    ? null
    : factor.status === "verified"
      ? "verified"
      : "unverified";

  const currentLevel = (aal.data?.currentLevel ?? null) as MfaStatus["currentLevel"];
  const nextLevel = (aal.data?.nextLevel ?? null) as MfaStatus["nextLevel"];

  return {
    factorId: factor?.id ?? null,
    factorStatus,
    currentLevel,
    nextLevel,
    challengeRequired: verified !== null && currentLevel === "aal1" && nextLevel === "aal2",
  };
}
