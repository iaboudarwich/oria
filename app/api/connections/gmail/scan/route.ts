import "server-only";

import { type NextRequest, NextResponse, after } from "next/server";
import { getCurrentContext } from "@/lib/data/organizations";
import { startGmailScan, getLatestScanJob } from "@/lib/integrations/gmail/scan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_TIMEFRAME_MONTHS = 6;

/**
 * POST /api/connections/gmail/scan
 * Body: { months?: number } (clamped 1..24, default 6).
 * Starts a scan and returns the job id immediately; the fetch + classify runs
 * in the background via after(). Idempotent-ish: if a scan is already running
 * we return that job instead of starting another.
 */
export async function POST(req: NextRequest) {
  const ctx = await getCurrentContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const months = await req
    .json()
    .then((b: { months?: number }) =>
      Math.max(1, Math.min(24, Math.round(Number(b?.months)) || DEFAULT_TIMEFRAME_MONTHS)),
    )
    .catch(() => DEFAULT_TIMEFRAME_MONTHS);

  const existing = await getLatestScanJob(ctx.profile.id);
  if (existing && existing.status === "running") {
    return NextResponse.json({ jobId: existing.id, alreadyRunning: true });
  }

  const started = await startGmailScan({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    timeframeMonths: months,
  });
  if (!started) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  // Run the heavy work after the response is sent.
  after(started.process);

  return NextResponse.json({ jobId: started.jobId });
}

/**
 * GET /api/connections/gmail/scan
 * Returns the latest scan job for the user so the review page can poll progress.
 */
export async function GET() {
  const ctx = await getCurrentContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const job = await getLatestScanJob(ctx.profile.id);
  return NextResponse.json({ job });
}
