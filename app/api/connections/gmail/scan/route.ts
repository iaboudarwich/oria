import "server-only";

import { type NextRequest, NextResponse, after } from "next/server";
import { getCurrentContext } from "@/lib/data/organizations";
import {
  startGmailScan,
  scanAllConnections,
  getAggregateScanStatus,
} from "@/lib/integrations/gmail/scan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_TIMEFRAME_MONTHS = 6;

/**
 * POST /api/connections/gmail/scan
 * Body: { connectionId?: string, months?: number }
 *   - connectionId set  -> scan just that connection
 *   - connectionId unset -> "Scan all": fan out to every active connection,
 *     concurrently. Each scan runs in the background via after().
 */
export async function POST(req: NextRequest) {
  const ctx = await getCurrentContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req
    .json()
    .then((b: { connectionId?: string; months?: number }) => ({
      connectionId: typeof b?.connectionId === "string" ? b.connectionId : null,
      months: Math.max(1, Math.min(24, Math.round(Number(b?.months)) || DEFAULT_TIMEFRAME_MONTHS)),
    }))
    .catch(() => ({ connectionId: null, months: DEFAULT_TIMEFRAME_MONTHS }));

  if (body.connectionId) {
    const started = await startGmailScan({
      userId: ctx.profile.id,
      connectionId: body.connectionId,
      organizationId: ctx.organization.id,
      timeframeMonths: body.months,
    });
    if (!started) {
      return NextResponse.json({ error: "not_connected" }, { status: 400 });
    }
    after(started.process);
    return NextResponse.json({ jobIds: [started.jobId] });
  }

  // Scan all active connections.
  const started = await scanAllConnections({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    timeframeMonths: body.months,
  });
  if (started.length === 0) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }
  for (const s of started) after(s.process);
  return NextResponse.json({ jobIds: started.map((s) => s.jobId) });
}

/**
 * GET /api/connections/gmail/scan
 * Aggregate scan status across all of the user's connections, for the review
 * page's progress banner.
 */
export async function GET() {
  const ctx = await getCurrentContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const status = await getAggregateScanStatus(ctx.profile.id);
  return NextResponse.json({ status });
}
