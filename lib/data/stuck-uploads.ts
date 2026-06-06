import "server-only";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext } from "./organizations";
import { runProcessUploadSafely } from "./upload-process-safe";

const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes. "processing"
// "received" means the upload row was inserted but the after()-scheduled
// extraction never ran (function crashed, deploy mid-flight, cold-start
// abort). Wait longer before declaring it stuck so we don't race a slow
// cold start, but still recover instead of leaving the row forever-orphan.
const RECEIVED_STUCK_MS = 10 * 60 * 1000; // 10 minutes
// How many rows one sweep will recover. Each one spends a few seconds of
// Claude time; capping keeps a single page render from queueing dozens.
const MAX_PER_SWEEP = 5;
const MAX_PER_SWEEP_ALL_ORGS = 20;

/**
 * Find uploads in the active org that have been stuck and schedule a
 * retry. Catches two cases:
 *   • status="processing" older than 5 min. extraction started but
 *     never finished (Claude timeout, function crash mid-flight).
 *   • status="received"   older than 10 min. the after() pass never
 *     even fired (the upload row landed in DB but the background job
 *     wasn't queued; usually a function abort right after the response).
 *
 * Called by the inbox page on render. cheap, indexed query, scoped
 * to the active org. Each retry is scheduled via `after()` so it
 * doesn't block the page response. Idempotent: if the original job
 * still finishes mid-retry, the retry just confirms the same state.
 */
export async function recoverStuckUploads(): Promise<void> {
  try {
    const ctx = await requireContext();
    const supabase = await createClient();
    const processingCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();
    const receivedCutoff = new Date(Date.now() - RECEIVED_STUCK_MS).toISOString();

    const { data } = await supabase
      .from("uploads")
      .select("id, status, updated_at")
      .eq("organization_id", ctx.organization.id)
      .in("status", ["processing", "received"])
      .is("deleted_at", null)
      .limit(50);

    type Row = { id: string; status: string; updated_at: string };
    const ids = ((data ?? []) as Row[])
      .filter((r) =>
        r.status === "processing" ? r.updated_at < processingCutoff : r.updated_at < receivedCutoff,
      )
      .map((r) => r.id)
      .slice(0, MAX_PER_SWEEP);
    if (ids.length === 0) return;

    const orgId = ctx.organization.id;
    after(async () => {
      for (const id of ids) {
        await runProcessUploadSafely(id, orgId);
      }
    });
  } catch {
    // Best-effort recovery. never break the inbox render.
  }
}

/**
 * Cross-org variant. Same logic as recoverStuckUploads but sweeps
 * every org and runs through the admin client (no cookies). The
 * per-org variant only fires when someone visits /dashboard/inbox
 * for that specific org, which means orphans in a Workspace nobody
 * is currently looking at sit forever. The admin health page calls
 * this so any operator visit doubles as a janitor pass.
 *
 * Returns the number of recoveries scheduled. Safe to call from
 * page renders. sweep is capped, never throws.
 */
export async function recoverStuckUploadsAcrossOrgs(): Promise<number> {
  try {
    const admin = createAdminClient();
    const processingCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();
    const receivedCutoff = new Date(Date.now() - RECEIVED_STUCK_MS).toISOString();

    const { data } = await admin
      .from("uploads")
      .select("id, organization_id, status, updated_at")
      .in("status", ["processing", "received"])
      .is("deleted_at", null)
      .limit(200);

    type Row = {
      id: string;
      organization_id: string;
      status: string;
      updated_at: string;
    };
    const targets = ((data ?? []) as Row[])
      .filter((r) =>
        r.status === "processing" ? r.updated_at < processingCutoff : r.updated_at < receivedCutoff,
      )
      .slice(0, MAX_PER_SWEEP_ALL_ORGS);

    if (targets.length === 0) return 0;

    after(async () => {
      for (const t of targets) {
        await runProcessUploadSafely(t.id, t.organization_id);
      }
    });
    return targets.length;
  } catch {
    return 0;
  }
}
