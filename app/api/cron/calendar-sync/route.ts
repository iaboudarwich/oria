import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { syncAllCalendars } from "@/lib/google/calendar";
import { syncAllOutlookCalendars } from "@/lib/microsoft/calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/calendar-sync
 *
 * Vercel Cron fires this hourly (see vercel.json). For each active Calendar
 * connection it pulls a -30/+90 day window, categorizes each event, routes it
 * to a section, and upserts into calendar_events.
 *
 * Auth: Authorization: Bearer CRON_SECRET (same secret as the other crons).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [google, outlook] = await Promise.all([syncAllCalendars(), syncAllOutlookCalendars()]);
  return NextResponse.json({ google, outlook });
}
