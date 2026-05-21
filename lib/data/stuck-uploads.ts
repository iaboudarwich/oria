import "server-only";

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { runProcessUploadSafely } from "./upload-process-safe";

const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Find uploads in the active org that have been "processing" for too
 * long and schedule a retry. A normal Claude pass finishes within a
 * minute even on large PDFs, so anything sitting in processing past
 * five minutes is almost certainly stuck (cold-start crash, deploy
 * mid-flight, runtime timeout that didn't update the row).
 *
 * Called by the inbox page on render — cheap, indexed query, scoped
 * to the active org. Each retry is scheduled via `after()` so it
 * doesn't block the page response. Idempotent: if the original job
 * still finishes mid-retry, the retry just confirms the same state.
 */
export async function recoverStuckUploads(): Promise<void> {
  try {
    const ctx = await requireContext();
    const supabase = await createClient();
    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

    const { data } = await supabase
      .from("uploads")
      .select("id")
      .eq("organization_id", ctx.organization.id)
      .eq("status", "processing")
      .lt("updated_at", cutoff)
      .limit(5);

    const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length === 0) return;

    const orgId = ctx.organization.id;
    after(async () => {
      for (const id of ids) {
        await runProcessUploadSafely(id, orgId);
      }
    });
  } catch {
    // Best-effort recovery — never break the inbox render.
  }
}
