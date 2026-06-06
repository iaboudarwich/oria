import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCloudFileContent } from "@/lib/google/cloud-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cloud-files/:id/content
 * Fetch-on-demand parsed text for one linked Drive file (cached 5 min in Redis,
 * never persisted). Returns 410 when the file is no longer accessible in Drive.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await fetchCloudFileContent(user.id, id);
  switch (result.status) {
    case "ok":
      return NextResponse.json({
        text: result.text,
        name: result.name,
        webViewLink: result.webViewLink,
      });
    case "inaccessible":
      return NextResponse.json(
        { error: "inaccessible", name: result.name, webViewLink: result.webViewLink },
        { status: 410 },
      );
    case "not_found":
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    default:
      return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
