import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { syncAllLinkedFolders } from "@/lib/google/cloud-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Listing + indexing across folders can take a while; give it room.
export const maxDuration = 300;

/**
 * GET /api/cron/drive-folder-sync
 *
 * Vercel Cron fires this hourly (see vercel.json). For every linked Drive
 * folder it picks up newly-added files, links them into the same section, and
 * indexes them for retrieval. Idempotent.
 *
 * Auth: Authorization: Bearer CRON_SECRET (same secret as the other crons).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const newlyLinked = await syncAllLinkedFolders();
  return NextResponse.json({ ok: true, newlyLinked });
}
