import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteCloudConnection, getCloudConnection } from "@/lib/google/cloud-connections";
import { logAuditEvent } from "@/lib/data/audit-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DELETE /api/cloud-connections/:id
 * Revokes the token at Google and deletes the connection row. Its cloud_files
 * and calendar_events cascade-delete via their FK. Owner-scoped.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conn = await getCloudConnection(user.id, id);
  if (!conn) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ok = await deleteCloudConnection(user.id, id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await logAuditEvent({
    userId: user.id,
    action: "cloud.disconnected",
    resourceType: "cloud_connection",
    resourceId: id,
    metadata: { provider: "google", service: conn.service, account_email: conn.accountEmail },
  });

  return NextResponse.json({ ok: true });
}
