import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, RATE_PRESETS } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/data/audit-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/account/export
 *
 * Authenticated. Returns a JSON file containing all data belonging to
 * the signed-in user. Rate-limited to 1 request per 24 hours.
 *
 * Includes:
 *   profile, uploads (with 24-hour signed download URLs), reminders,
 *   conversations + messages, memory_items, invitations sent,
 *   circles/workspaces the user is a member of.
 *
 * Excludes:
 *   Other users' data in shared circles, raw file bytes.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Rate limit: 1 export per user per 24 hours.
  const rl = rateLimit({
    key: `export:${user.id}`,
    ...RATE_PRESETS.export(),
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: rl.message },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      },
    );
  }

  const admin = createAdminClient();

  // ── Profile ──────────────────────────────────────────────────────────
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, email, avatar_url, created_at, updated_at")
    .eq("id", user.id)
    .single();

  // ── Memberships / spaces ─────────────────────────────────────────────
  const { data: memberships } = await admin
    .from("memberships")
    .select("organization_id, role, created_at, organizations(id, name, kind)")
    .eq("user_id", user.id);

  const spaces = (memberships ?? []).map((m: Record<string, unknown>) => ({
    organization_id: m.organization_id,
    role: m.role,
    joined_at: m.created_at,
    organization: m.organizations,
  }));

  // ── Uploads ──────────────────────────────────────────────────────────
  const { data: uploadRows } = await admin
    .from("uploads")
    .select("id, filename, title, mime_type, size_bytes, section, status, storage_path, created_at")
    .eq("uploaded_by", user.id)
    .order("created_at", { ascending: false });

  // Generate 24-hour signed URLs for each upload.
  const storagePaths = (uploadRows ?? [])
    .map((u: { storage_path: string }) => u.storage_path)
    .filter(Boolean);

  const signedUrlMap: Record<string, string> = {};
  if (storagePaths.length > 0) {
    const { data: signed } = await admin.storage
      .from("uploads")
      .createSignedUrls(storagePaths, 24 * 60 * 60);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) {
        signedUrlMap[s.path] = s.signedUrl;
      }
    }
  }

  const uploads = (uploadRows ?? []).map((u: Record<string, unknown>) => ({
    ...u,
    download_url: signedUrlMap[u.storage_path as string] ?? null,
    storage_path: undefined, // don't leak internal bucket paths
  }));

  // ── Reminders ────────────────────────────────────────────────────────
  const { data: reminders } = await admin
    .from("reminders")
    .select("id, title, due_at, done, notes, upload_id, organization_id, created_at")
    .eq("created_by", user.id)
    .order("due_at", { ascending: true });

  // ── Conversations + messages ─────────────────────────────────────────
  const { data: convRows } = await admin
    .from("conversations")
    .select("id, title, organization_id, starred, created_at, updated_at")
    .eq("created_by", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const convIds = (convRows ?? []).map((c: { id: string }) => c.id);
  let messages: unknown[] = [];
  if (convIds.length > 0) {
    const { data: msgRows } = await admin
      .from("messages")
      .select("id, conversation_id, role, content, created_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: true });
    messages = msgRows ?? [];
  }

  const conversations = (convRows ?? []).map((c: Record<string, unknown>) => ({
    ...c,
    messages: (messages as Record<string, unknown>[]).filter((m) => m.conversation_id === c.id),
  }));

  // ── Memory items ─────────────────────────────────────────────────────
  const orgIds = (memberships ?? []).map((m: { organization_id: string }) => m.organization_id);
  let memoryItems: unknown[] = [];
  if (orgIds.length > 0) {
    // Only items extracted from uploads the user owns.
    const uploadIds = (uploadRows ?? []).map((u: { id: string }) => u.id);
    if (uploadIds.length > 0) {
      const { data: items } = await admin
        .from("memory_items")
        .select("id, section, document_type, summary, raw_text, created_at")
        .in("upload_id", uploadIds)
        .order("created_at", { ascending: false });
      memoryItems = items ?? [];
    }
  }

  // ── Invitations sent ─────────────────────────────────────────────────
  const { data: invitesSent } = await admin
    .from("invites")
    .select("id, email, role, organization_id, created_at, accepted_at")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  // ── Assemble export ───────────────────────────────────────────────────
  const exportDate = new Date().toISOString().slice(0, 10);
  const payload = {
    export_meta: {
      generated_at: new Date().toISOString(),
      user_id: user.id,
      version: "1",
    },
    profile,
    spaces,
    uploads,
    reminders: reminders ?? [],
    conversations,
    memory_items: memoryItems,
    invitations_sent: invitesSent ?? [],
  };

  const body = JSON.stringify(payload, null, 2);
  const filename = `oria-export-${user.id.slice(0, 8)}-${exportDate}.json`;

  await logAuditEvent({
    userId: user.id,
    action: "account.export",
    metadata: { bytes: body.length },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
