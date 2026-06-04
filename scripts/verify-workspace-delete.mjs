#!/usr/bin/env node
/**
 * Proves a deleted WORKSPACE (and the data it owns) is actually gone, with no
 * orphaned rows. Mirrors the real delete: the action ends in
 * `admin.from("organizations").delete().eq("id", orgId)`, relying on FK
 * ON DELETE CASCADE to remove every owned row.
 *
 * Creates an isolated temp office org + owner membership + one upload and one
 * memory_item, deletes the org via the admin client (exactly what deleteSpace
 * does), then asserts the org AND its owned rows are gone. Touches nothing real.
 *
 * Run: node scripts/verify-workspace-delete.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

process.loadEnvFile(".env.local");
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SRK) {
  console.error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}
const admin = createClient(URL, SRK, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
  ok ? pass++ : fail++;
}

const email = `wsdel-${randomUUID().slice(0, 8)}@example.com`;
let userId = null;
let orgId = null;
let uploadId = null;
let itemId = null;
try {
  // Temp user (owner of the workspace).
  const created = await admin.auth.admin.createUser({ email, password: "Pw-" + randomUUID(), email_confirm: true });
  userId = created.data.user?.id ?? null;
  check("temp user created", !!userId);

  // A workspace (office) org + owner membership.
  const orgRes = await admin
    .from("organizations")
    .insert({ slug: `wsdel-${randomUUID().slice(0, 8)}`, name: "Delete Me Workspace", kind: "office", parent_kind: "work", created_by: userId })
    .select("id")
    .single();
  orgId = orgRes.data?.id ?? null;
  check("workspace (office) org created", !!orgId, orgRes.error?.message ?? "");
  await admin.from("memberships").insert({ organization_id: orgId, user_id: userId, role: "owner" });

  // Owned data: an upload and a memory_item.
  const up = await admin
    .from("uploads")
    .insert({ organization_id: orgId, uploaded_by: userId, storage_path: `x/${randomUUID()}`, filename: "f.pdf", status: "received" })
    .select("id")
    .single();
  uploadId = up.data?.id ?? null;
  check("owned upload created", !!uploadId, up.error?.message ?? "");
  const mi = await admin
    .from("memory_items")
    .insert({ organization_id: orgId, title: "Owned item", entities: {}, facts: {} })
    .select("id")
    .single();
  itemId = mi.data?.id ?? null;
  check("owned memory_item created", !!itemId, mi.error?.message ?? "");

  // THE DELETE (what deleteSpace runs).
  const del = await admin.from("organizations").delete().eq("id", orgId);
  check("delete returned no error", !del.error, del.error?.message ?? "");

  // The org row is gone.
  const orgGone = await admin.from("organizations").select("id").eq("id", orgId).maybeSingle();
  check("workspace row is gone after delete", !orgGone.data);

  // The owned rows are gone (cascade), no orphans.
  const memGone = await admin.from("memberships").select("id").eq("organization_id", orgId);
  check("membership rows are gone (cascade)", (memGone.data ?? []).length === 0);
  const upGone = await admin.from("uploads").select("id").eq("id", uploadId).maybeSingle();
  check("owned upload is gone (cascade)", !upGone.data);
  const itemGone = await admin.from("memory_items").select("id").eq("id", itemId).maybeSingle();
  check("owned memory_item is gone (cascade)", !itemGone.data);
} catch (e) {
  check("no unexpected error", false, e instanceof Error ? e.message : String(e));
} finally {
  // Best-effort cleanup (the org is already deleted; just remove the user).
  try {
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  } catch {
    // ignore cleanup errors
  }
  console.log("cleaned up");
}

console.log(`\nworkspace-delete: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
