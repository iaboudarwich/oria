import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAdapter } from "@/lib/ai-providers";
import { getActiveAiConnectionKey, setAiConnectionStatus } from "@/lib/data/ai-connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ai-connections/revalidate
 * Re-run validation on the stored key and update the connection status.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conn = await getActiveAiConnectionKey(user.id);
  if (!conn) return NextResponse.json({ error: "no_connection" }, { status: 404 });

  const result = await buildAdapter(conn.provider, conn.apiKey).validateKey();
  await setAiConnectionStatus(user.id, result.status, result.valid ? null : (result.error ?? null));
  return NextResponse.json({ status: result.status, valid: result.valid });
}
