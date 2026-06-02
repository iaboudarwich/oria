import "server-only";

import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCloudConnectionsByService, getCloudConnection } from "@/lib/google/cloud-connections";
import { linkCloudFiles, indexConnectionFiles, type PickedFile } from "@/lib/google/cloud-files";
import { logAuditEvent } from "@/lib/data/audit-log";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  organizationId: string;
  sectionKey: string;
  connectionId?: string;
  files: PickedFile[];
};

/**
 * POST /api/cloud-files/link
 * Persist the references for files picked via the Google Picker, then index
 * them (metadata + AI summary + embedding) in the background. Stores only
 * references, never content.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.organizationId || !body.sectionKey || !Array.isArray(body.files) || body.files.length === 0) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Resolve the file-storage connection. With an explicit id (Drive or OneDrive
  // picker), validate it belongs to the user; otherwise default to the first
  // Google Drive connection.
  let conn = null as Awaited<ReturnType<typeof getCloudConnection>>;
  if (body.connectionId) {
    const c = await getCloudConnection(user.id, body.connectionId);
    if (c && (c.service === "drive" || c.service === "onedrive")) conn = c;
  } else {
    conn = (await listCloudConnectionsByService(user.id, "drive"))[0] ?? null;
  }
  if (!conn) return NextResponse.json({ error: "no_file_connection" }, { status: 409 });

  const { linked } = await linkCloudFiles({
    userId: user.id,
    connectionId: conn.id,
    organizationId: body.organizationId,
    sectionKey: body.sectionKey,
    files: body.files,
  });

  await logAuditEvent({
    userId: user.id,
    action: "cloud.file_linked",
    resourceType: "cloud_connection",
    resourceId: conn.id,
    metadata: { count: linked, section: body.sectionKey },
  });

  // Index (summarize + embed) in the background so the response is immediate.
  after(indexConnectionFiles(conn.id).then(() => undefined));

  revalidatePath(`/dashboard/sections/${body.sectionKey}`);
  return NextResponse.json({ ok: true, linked });
}
