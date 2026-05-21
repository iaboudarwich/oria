"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { generateWorkReport } from "@/lib/ai/work-report";
import { recordSystemEvent } from "./system-events";

/**
 * Re-run a failed workspace report. Mirrors the upload-retry pattern:
 * scope-check the row against the active org, flip the status back to
 * "pending", run the AI pass in after() so the action returns
 * immediately, and update with ready/failed on completion. The same
 * report.ready / report.failed events fire as on the original run.
 *
 * Refuses to touch healthy "ready" rows. Idempotent on accidental
 * double-clicks (a second call while pending stays pending).
 */
export async function retryReport(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const ctx = await requireContext();
  if (ctx.organization.kind !== "office") return;

  const supabase = await createClient();

  const { data: row } = await supabase
    .from("workspace_reports")
    .select("id, organization_id, status, prompt, kind, title")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!row) return;
  const report = row as {
    id: string;
    organization_id: string;
    status: string | null;
    prompt: string | null;
    kind: string | null;
    title: string | null;
  };

  // Only retry failed or stuck-pending rows.
  if (report.status !== "failed") return;
  const prompt = (report.prompt ?? report.title ?? "").trim();
  if (!prompt) return;
  const kind = report.kind ?? "analysis";

  // Flip back to pending so the UI shows "Analyzing · 0s" right away
  // and the poller picks the row up.
  await supabase
    .from("workspace_reports")
    .update({
      status: "pending",
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", report.id);

  after(async () => {
    const result = await generateWorkReport({ prompt, kind });
    const supabase2 = await createClient();
    if (result.ok) {
      const finalTitle = result.title || prompt.slice(0, 80);
      await supabase2
        .from("workspace_reports")
        .update({
          title: finalTitle,
          payload: result.payload,
          status: "ready",
          updated_at: new Date().toISOString(),
        })
        .eq("id", report.id);
      void recordSystemEvent({
        kind: "report.ready",
        severity: "info",
        context: { reportId: report.id, title: finalTitle, kind, retry: true },
        organizationId: ctx.organization.id,
        actorId: ctx.profile.id,
      });
    } else {
      await supabase2
        .from("workspace_reports")
        .update({
          status: "failed",
          error_message: result.error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", report.id);
      void recordSystemEvent({
        kind: "report.failed",
        severity: "error",
        message: result.error,
        context: {
          reportId: report.id,
          prompt: prompt.slice(0, 200),
          kind,
          retry: true,
        },
        organizationId: ctx.organization.id,
        actorId: ctx.profile.id,
      });
    }
    revalidatePath("/dashboard/work/agent");
    revalidatePath("/dashboard/work/analysis");
    revalidatePath(`/dashboard/work/agent/reports/${report.id}`);
  });

  revalidatePath("/dashboard/work/agent");
  revalidatePath("/dashboard/work/analysis");
}
