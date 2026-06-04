import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { runDailyLoop } from "@/lib/daily/runner";
import { runPatternDecay } from "@/lib/patterns/patterns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/daily-loop
 *
 * Vercel Cron fires this every hour (see vercel.json). For each user it reads
 * the local wall-clock from profiles.timezone and fires whatever is due this
 * local hour: time-based routines (Morning Briefing, Weekly Review, Yesterday
 * Recap, custom), pre-meeting prep ahead of calendar events, the 21:00 Daily
 * Journal, and the dawn roll-forward of unfinished items. Every step is
 * idempotent, so the hourly cadence and any retry are safe.
 *
 * Auth: Authorization: Bearer CRON_SECRET (same secret as the other crons).
 * Returns: { users, routinesRun, prepsRun, journalsRun, rolledForward }.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const summary = await runDailyLoop(now);

  // Pattern-memory decay rides this same cron, gated to once per day (03:00
  // UTC) so unreinforced patterns age down without compounding hourly.
  const decay = now.getUTCHours() === 3 ? await runPatternDecay(now) : null;

  return NextResponse.json({ ...summary, patternDecay: decay });
}
