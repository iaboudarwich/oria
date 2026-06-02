import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listCloudConnectionsByService } from "@/lib/google/cloud-connections";
import { getFreshCloudAccessToken } from "@/lib/google/token-refresh";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cloud-files/picker-token
 * Returns a short-lived Drive access token (drive.file scope only) plus the
 * Picker developer key + app id, so the client-side Google Picker can run. The
 * token is drive.file-scoped, so it only ever grants access to files the user
 * explicitly picks. Returns 409 when no Drive account is connected.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const driveConns = await listCloudConnectionsByService(user.id, "drive");
  const conn = driveConns.find((c) => c.status === "active") ?? driveConns[0];
  if (!conn) return NextResponse.json({ error: "no_drive_connection" }, { status: 409 });

  const token = await getFreshCloudAccessToken(conn.id);
  if (!token) return NextResponse.json({ error: "token_unavailable" }, { status: 502 });

  return NextResponse.json({
    accessToken: token.accessToken,
    connectionId: conn.id,
    accountEmail: conn.accountEmail,
    developerKey: process.env.GOOGLE_PICKER_API_KEY ?? "",
    appId: process.env.GOOGLE_PICKER_APP_ID ?? "",
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  });
}
