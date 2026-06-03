/**
 * Storage RLS audit — does the storage bucket policy honour the same
 * visibility rules as uploads_read_v2?
 *
 * Spins up two ephemeral test users, has User A upload a file in
 * User A's auto-bootstrapped personal org, then has User B (who is
 * NOT in A's org) try every access vector we can think of:
 *
 *   1. Direct download via the storage SDK with B's session.
 *   2. createSignedUrl() via the SDK with B's session.
 *   3. Plain HTTPS GET to the public render endpoint.
 *
 * All three MUST fail. Then we add User B as a "limited" member of
 * A's org with NO section access and rerun the same three checks.
 * Per the design spec, all three must still fail (limited members
 * only see their assigned sections, and the upload was filed in a
 * section they don't have access to). The current 0001_init.sql
 * storage policy uses is_org_member only and does NOT enforce
 * section-level access — this script is designed to catch that.
 *
 * Cleanup is unconditional: every created user, org, upload, and
 * storage object is removed on completion (or on any error).
 *
 * Run with:
 *   npx tsx scripts/audit-storage-rls.ts --confirm
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in
 * the shell or .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
  console.error("Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!process.argv.includes("--confirm")) {
  console.error(
    "Refusing to run without --confirm. This script creates ephemeral test users in the linked Supabase project; pass --confirm to proceed.",
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type TestUser = {
  id: string;
  email: string;
  password: string;
  client: ReturnType<typeof createClient>;
};

type Finding = { check: string; pass: boolean; detail?: string };
const findings: Finding[] = [];
const cleanups: Array<() => Promise<void>> = [];

function record(check: string, pass: boolean, detail?: string) {
  findings.push({ check, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${check}${detail ? `   (${detail})` : ""}`);
}

async function createUser(label: string): Promise<TestUser> {
  const email = `audit-storage-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = `pw-${Math.random().toString(36).slice(2, 14)}-Test1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser(${label}): ${error?.message}`);
  const id = data.user.id;
  cleanups.unshift(async () => {
    await admin.auth.admin.deleteUser(id);
  });
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const sign = await client.auth.signInWithPassword({ email, password });
  if (sign.error) throw new Error(`signIn(${label}): ${sign.error.message}`);
  return { id, email, password, client };
}

async function bootstrapPersonalOrg(user: TestUser): Promise<string> {
  // The trigger on auth.users normally bootstraps a personal org; if
  // it didn't, do it explicitly via admin so the test isn't trigger-
  // dependent.
  const { data: existing } = await admin
    .from("memberships")
    .select("organization_id, organizations!inner(id, kind)")
    .eq("user_id", user.id);
  type Row = { organization_id: string; organizations: { id: string; kind: string } };
  const rows = (existing ?? []) as Row[];
  const personal = rows.find((r) => r.organizations.kind === "personal");
  if (personal) return personal.organization_id;

  const { data: org } = await admin
    .from("organizations")
    .insert({ slug: `audit-${user.id.slice(0, 8)}`, name: "Audit personal", kind: "personal", created_by: user.id })
    .select("id")
    .single();
  if (!org) throw new Error("bootstrap: could not create personal org");
  await admin.from("memberships").insert({
    user_id: user.id,
    organization_id: (org as { id: string }).id,
    role: "owner",
  });
  return (org as { id: string }).id;
}

async function uploadFileAs(user: TestUser, orgId: string): Promise<{
  uploadId: string;
  storagePath: string;
}> {
  const uploadId = crypto.randomUUID();
  const path = `${orgId}/${uploadId}/audit-secret.txt`;
  const body = new TextEncoder().encode("SECRET CONTENT for storage RLS audit");
  // Use the user's session for the upload so we exercise the
  // insert RLS the same way the app does.
  const up = await user.client.storage.from("uploads").upload(path, body, {
    contentType: "text/plain",
  });
  if (up.error) throw new Error(`upload: ${up.error.message}`);

  // Insert the matching DB row using the user's session so visibility
  // checks downstream have a row to find.
  const ins = await user.client.from("uploads").insert({
    id: uploadId,
    organization_id: orgId,
    uploaded_by: user.id,
    storage_path: path,
    filename: "audit-secret.txt",
    mime_type: "text/plain",
    size_bytes: body.byteLength,
    title: "audit-secret.txt",
    status: "received",
    metadata: {},
  });
  if (ins.error) throw new Error(`uploads insert: ${ins.error.message}`);

  cleanups.unshift(async () => {
    await admin.storage.from("uploads").remove([path]).catch(() => {});
    await admin.from("uploads").delete().eq("id", uploadId);
  });
  return { uploadId, storagePath: path };
}

async function attackerAttempts(label: string, attacker: TestUser, storagePath: string) {
  // 1. Direct SDK download.
  const dl = await attacker.client.storage.from("uploads").download(storagePath);
  record(
    `${label}: SDK download() blocked`,
    !!dl.error,
    dl.error ? dl.error.message : "SUCCEEDED (gap)",
  );

  // 2. Sign URL via SDK.
  const su = await attacker.client.storage
    .from("uploads")
    .createSignedUrl(storagePath, 60);
  record(
    `${label}: createSignedUrl() blocked`,
    !!su.error,
    su.error ? su.error.message : "got URL (gap)",
  );

  // 3. HTTPS GET to render endpoint with attacker's access token.
  const session = await attacker.client.auth.getSession();
  const at = session.data.session?.access_token ?? "";
  const url = `${SUPABASE_URL}/storage/v1/object/uploads/${encodeURI(storagePath)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${at}` } });
  record(
    `${label}: HTTPS GET to render endpoint blocked`,
    res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404,
    `HTTP ${res.status}`,
  );
}

async function addLimitedMember(orgId: string, userId: string) {
  // Add as 'limited' with EMPTY section list — they should see nothing.
  await admin.from("memberships").insert({
    user_id: userId,
    organization_id: orgId,
    role: "household",
    access_level: "limited",
  });
  cleanups.unshift(async () => {
    await admin
      .from("memberships")
      .delete()
      .eq("organization_id", orgId)
      .eq("user_id", userId);
  });
}

async function main() {
  console.log("Storage RLS audit");
  console.log("-----------------\n");

  let userA: TestUser | undefined;
  let userB: TestUser | undefined;
  try {
    console.log("Creating two test users…");
    userA = await createUser("a");
    userB = await createUser("b");

    console.log("Bootstrapping personal org for A…");
    const orgA = await bootstrapPersonalOrg(userA);

    console.log("A uploads a file…");
    const { storagePath } = await uploadFileAs(userA, orgA);

    console.log("\n[1] B is a complete stranger to A's org:");
    await attackerAttempts("stranger", userB, storagePath);

    console.log("\n[2] B is now a LIMITED member of A's org with NO section access:");
    await addLimitedMember(orgA, userB.id);
    await attackerAttempts("limited-no-sections", userB, storagePath);

    console.log("\nSummary");
    console.log("-------");
    const passed = findings.filter((f) => f.pass).length;
    const failed = findings.filter((f) => !f.pass).length;
    console.log(`${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.error("\nGAPS:");
      for (const f of findings.filter((x) => !x.pass)) {
        console.error(`  - ${f.check}${f.detail ? `   (${f.detail})` : ""}`);
      }
      process.exitCode = 1;
    }
  } finally {
    console.log("\nCleaning up…");
    for (const fn of cleanups) {
      await fn().catch(() => {});
    }
    console.log("Done.");
  }
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exitCode = 1;
});
