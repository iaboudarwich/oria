import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unlinkCloudFile } from "@/lib/google/cloud-files";
import { logAuditEvent } from "@/lib/data/audit-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * DELETE /api/cloud-files/:id
 * Remove one linked Drive file reference. Owner-scoped. Does not touch the file
 * in Drive (Oria only ever held a reference).
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ok = await unlinkCloudFile(user.id, id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await logAuditEvent({
    userId: user.id,
    action: "cloud.file_unlinked",
    resourceType: "cloud_file",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}
