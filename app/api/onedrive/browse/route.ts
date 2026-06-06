import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCloudConnection } from "@/lib/google/cloud-connections";
import { browseOneDrive } from "@/lib/microsoft/onedrive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/onedrive/browse?connectionId=...&folderId=...
 * Lists the children of a OneDrive folder for the custom picker. Owner-scoped;
 * the connection must be the user's. The token stays server-side.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const connectionId = url.searchParams.get("connectionId") ?? "";
  const folderId = url.searchParams.get("folderId");

  const conn = await getCloudConnection(user.id, connectionId);
  if (!conn || conn.service !== "onedrive") {
    return NextResponse.json({ error: "no_onedrive_connection" }, { status: 409 });
  }

  const result = await browseOneDrive(connectionId, folderId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === "token" ? 502 : 500 },
    );
  }
  return NextResponse.json({ items: result.items });
}
