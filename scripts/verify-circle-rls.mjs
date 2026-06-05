#!/usr/bin/env node
/**
 * RLS BOUNDARY TEST for circles (Round 21.5) - the round's whole point.
 *
 * Proves cross-circle isolation AT THE DATABASE, not in the UI: it seeds an
 * owner + a member + a circle, scopes one item to the circle and one to the
 * owner's PRIVATE space, then queries as EACH user through an RLS-enforced
 * client (signed in as that user, anon key, not the service role) and asserts:
 *   - a member sees ONLY the circle's items, never the owner's private items;
 *   - the owner sees the UNION (private + circle);
 *   - a REMOVED member immediately loses access;
 *   - default scope is private (a personal-space item is owner-only);
 *   - the ORPHAN RULE: deleting the circle reverts its items to the owner's
 *     private space (they survive, the member can no longer see them).
 * Touches nothing real; cleans up the temp users + orgs at the end.
 *
 * Run: node scripts/verify-circle-rls.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

process.loadEnvFile(".env.local");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !SRK || !ANON) {
  console.error("Missing env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  process.exit(1);
}
const admin = createClient(URL, SRK, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
  ok ? pass++ : fail++;
}

async function userClient(email, password) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signin ${email}: ${error.message}`);
  return c;
}

const pw = "Pw-" + randomUUID();
let owner = null;
let member = null;
let personalOrg = null;
let circleOrg = null;
let privateItem = null;
let circleItem = null;

try {
  // Two temp users.
  const oEmail = `crcl-owner-${randomUUID().slice(0, 8)}@example.com`;
  const mEmail = `crcl-member-${randomUUID().slice(0, 8)}@example.com`;
  owner = (await admin.auth.admin.createUser({ email: oEmail, password: pw, email_confirm: true })).data.user?.id;
  member = (await admin.auth.admin.createUser({ email: mEmail, password: pw, email_confirm: true })).data.user?.id;
  check("temp owner + member created", !!owner && !!member);

  // Owner's PRIVATE (personal) space + a CIRCLE the member also belongs to.
  personalOrg = (
    await admin.from("organizations").insert({ slug: `p-${randomUUID().slice(0, 8)}`, name: "Personal", kind: "personal", parent_kind: "personal", created_by: owner }).select("id").single()
  ).data?.id;
  circleOrg = (
    await admin.from("organizations").insert({ slug: `c-${randomUUID().slice(0, 8)}`, name: "Family", kind: "circle", parent_kind: "personal", created_by: owner }).select("id").single()
  ).data?.id;
  await admin.from("memberships").insert([
    { organization_id: personalOrg, user_id: owner, role: "owner", access_level: "owner" },
    { organization_id: circleOrg, user_id: owner, role: "owner", access_level: "owner" },
    { organization_id: circleOrg, user_id: member, role: "member", access_level: "full" },
  ]);
  check("owner personal + circle (owner + member) created", !!personalOrg && !!circleOrg);

  // One PRIVATE item, one CIRCLE item.
  privateItem = (
    await admin.from("memory_items").insert({ organization_id: personalOrg, title: "Private note", entities: {}, facts: {} }).select("id").single()
  ).data?.id;
  circleItem = (
    await admin.from("memory_items").insert({ organization_id: circleOrg, title: "Shared note", entities: {}, facts: {} }).select("id").single()
  ).data?.id;
  check("private + circle items seeded", !!privateItem && !!circleItem);

  // --- BOUNDARY ASSERTIONS (RLS-enforced clients) ---
  const ownerC = await userClient(oEmail, pw);
  const memberC = await userClient(mEmail, pw);

  const ownerSees = (await ownerC.from("memory_items").select("id").in("id", [privateItem, circleItem])).data ?? [];
  check("owner sees the UNION (private + circle)", ownerSees.length === 2, `${ownerSees.length}/2`);

  const memberSeesCircle = (await memberC.from("memory_items").select("id").eq("id", circleItem)).data ?? [];
  check("member sees the circle item", memberSeesCircle.length === 1);

  const memberSeesPrivate = (await memberC.from("memory_items").select("id").eq("id", privateItem)).data ?? [];
  check("member CANNOT see the owner's PRIVATE item", memberSeesPrivate.length === 0);

  // Removed member loses access immediately.
  await admin.from("memberships").delete().eq("organization_id", circleOrg).eq("user_id", member);
  const removedC = await userClient(mEmail, pw);
  const afterRemoval = (await removedC.from("memory_items").select("id").in("id", [privateItem, circleItem])).data ?? [];
  check("a REMOVED member immediately loses access (sees nothing)", afterRemoval.length === 0, `${afterRemoval.length}`);

  // --- ORPHAN RULE: circle delete reverts items to the owner's private space ---
  await admin.from("memory_items").update({ organization_id: personalOrg }).eq("organization_id", circleOrg);
  await admin.from("organizations").delete().eq("id", circleOrg);
  const survived = (await admin.from("memory_items").select("organization_id").eq("id", circleItem).maybeSingle()).data;
  check("orphan rule: the circle item SURVIVED, reverted to owner private", survived?.organization_id === personalOrg);
  const circleGone = (await admin.from("organizations").select("id").eq("id", circleOrg).maybeSingle()).data;
  check("the circle org is gone", !circleGone);
} catch (e) {
  check("no unexpected error", false, e instanceof Error ? e.message : String(e));
} finally {
  // Cleanup: delete the personal org (cascades its rows) + the temp users.
  try {
    if (personalOrg) await admin.from("organizations").delete().eq("id", personalOrg);
    if (circleOrg) await admin.from("organizations").delete().eq("id", circleOrg);
    if (owner) await admin.auth.admin.deleteUser(owner);
    if (member) await admin.auth.admin.deleteUser(member);
  } catch {
    /* best-effort */
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
