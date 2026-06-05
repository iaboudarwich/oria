import { type NextRequest, NextResponse } from "next/server";
import { syncAllWhoopConnections } from "@/lib/whoop/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/whoop-sync
 *
 * Vercel Cron fires this every ~4 hours (see vercel.json). Pulls recovery,
 * sleep, and day strain/energy from every active WHOOP connection into
 * health_metrics. Idempotent per day, so overlapping windows never duplicate.
 * Auth: Authorization: Bearer CRON_SECRET (same secret as the other crons).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncAllWhoopConnections();
  return NextResponse.json(result);
}
