"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext } from "./organizations";
import { generateWorkReport } from "@/lib/ai/work-report";
import { recordSystemEvent } from "./system-events";
import { createJob, markJobCompleted, markJobFailed, markJobStarted } from "./jobs";

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

  // Open a fresh job row for this retry. Tracking retries as
  // distinct job rows (rather than mutating the original) keeps
  // the audit trail clean: each background_jobs row corresponds to
  // one run.
  const jobId = await createJob({
    organizationId: ctx.organization.id,
    actorId: ctx.profile.id,
    kind: "report.generate",
    reportId: report.id,
    context: { kind, prompt: prompt.slice(0, 200), retry: true },
  });

  // after() runs after the response is gone. cookies aren't readable
  // there. Use the admin client and pass org info into the generator
  // explicitly; scope is preserved by report.id + the captured orgId.
  const orgId = ctx.organization.id;
  const orgName = ctx.organization.name;
  const actorId = ctx.profile.id;
  const reportId = report.id;

  after(async () => {
    await markJobStarted(jobId);
    const result = await generateWorkReport({
      prompt,
      kind,
      organizationId: orgId,
      organizationName: orgName,
      actorId,
    });
    const supabase2 = createAdminClient();
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
        .eq("id", reportId);
      void recordSystemEvent({
        kind: "report.ready",
        severity: "info",
        context: { reportId, title: finalTitle, kind, retry: true },
        organizationId: orgId,
        actorId,
      });
      await markJobCompleted(jobId, { kind, title: finalTitle, retry: true });
    } else {
      await supabase2
        .from("workspace_reports")
        .update({
          status: "failed",
          error_message: result.error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reportId);
      void recordSystemEvent({
        kind: "report.failed",
        severity: "error",
        message: result.error,
        context: {
          reportId,
          prompt: prompt.slice(0, 200),
          kind,
          retry: true,
        },
        organizationId: orgId,
        actorId,
      });
      await markJobFailed(jobId, result.error ?? "report_failed");
    }
    revalidatePath("/dashboard/work/agent");
    revalidatePath("/dashboard/work/analysis");
    revalidatePath(`/dashboard/work/agent/reports/${reportId}`);
  });

  revalidatePath("/dashboard/work/agent");
  revalidatePath("/dashboard/work/analysis");
}
