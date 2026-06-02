import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { revalidateAllAiConnections } from "@/lib/data/ai-connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/ai-revalidate
 *
 * Vercel Cron fires this weekly (see vercel.json). Re-validates every stored AI
 * connection key and updates its status, so a key that silently expired or ran
 * out of credits is reflected in Settings -> AI before the user's next query.
 *
 * Auth: Authorization: Bearer CRON_SECRET (same secret as the other crons).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await revalidateAllAiConnections();
  return NextResponse.json({ ok: true, ...result });
}
