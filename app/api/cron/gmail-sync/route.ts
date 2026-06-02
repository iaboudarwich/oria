import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { syncAllGmailConnections } from "@/lib/integrations/gmail/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Sync can pull + classify mail for several connections; give it room.
export const maxDuration = 300;

/**
 * GET /api/cron/gmail-sync
 *
 * Vercel Cron fires this every 6 hours (see vercel.json). For each active
 * Gmail connection it incrementally scans new mail, auto-applies renewals to
 * already-approved trackables, and emails a short review summary when new
 * pending items remain.
 *
 * Auth: Authorization: Bearer CRON_SECRET (same secret as the other crons).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncAllGmailConnections();
  return NextResponse.json(result);
}
