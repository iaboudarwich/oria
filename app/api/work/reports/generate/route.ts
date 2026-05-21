import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentContext } from "@/lib/data/organizations";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateWorkReport } from "@/lib/ai/work-report";
import { checkDailyAskRequests } from "@/lib/data/quotas";
import { rateLimit, RATE_PRESETS } from "@/lib/rate-limit";
import { recordSystemEvent } from "@/lib/data/system-events";
import {
  createJob,
  markJobCompleted,
  markJobFailed,
  markJobStarted,
} from "@/lib/data/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * On-demand Work report generation.
 *
 * Body: { prompt: string, kind?: string }
 *
 * Inserts a pending row, returns the id immediately, then runs the actual
 * Claude generation in after() so the user sees the report appear with a
 * "pending" badge and it fills in (via revalidatePath) when ready.
 */
export async function POST(request: Request) {
  const ctx = await getCurrentContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (ctx.organization.kind !== "office") {
    return NextResponse.json({ error: "not_a_workspace" }, { status: 400 });
  }

  let body: { prompt?: string; kind?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "empty_prompt" }, { status: 400 });
  }
  const kind = typeof body.kind === "string" ? body.kind.trim() || "summary" : "summary";

  // Reports are heavier — one Claude call with retrieval + reasoning.
  // Use an hourly burst window instead of per-minute so a normal user
  // can fire off a few in quick succession but not a script-attack volume.
  const burst = rateLimit({
    key: `report:${ctx.profile.id}`,
    ...RATE_PRESETS.report(),
  });
  if (!burst.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: burst.message },
      {
        status: 429,
        headers: { "Retry-After": String(burst.retryAfterSeconds) },
      },
    );
  }

  const quota = await checkDailyAskRequests(ctx.profile.id);
  if (!quota.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: quota.message },
      { status: 429 },
    );
  }

  const supabase = await createClient();
  const { data: inserted, error: insertError } = await supabase
    .from("workspace_reports")
    .insert({
      organization_id: ctx.organization.id,
      title: prompt.slice(0, 80),
      kind,
      prompt,
      status: "pending",
      created_by: ctx.profile.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: "insert_failed", message: insertError?.message },
      { status: 500 },
    );
  }
  const reportId = (inserted as { id: string }).id;

  // Open a background-job row alongside the workspace_reports row so
  // the report's run is visible in the unified jobs log too.
  const jobId = await createJob({
    organizationId: ctx.organization.id,
    actorId: ctx.profile.id,
    kind: "report.generate",
    reportId,
    context: { kind, prompt: prompt.slice(0, 200) },
  });

  // Generate in the background so the POST returns immediately. The UI
  // polls listWorkspaceReports / report detail to pick up the ready row.
  //
  // after() runs after the response is sent, so cookies are no longer
  // accessible — use the service-role admin client for the row update,
  // and pass org info into generateWorkReport explicitly (it no longer
  // calls requireContext internally). Capture the small bag of values
  // we need here so the closure doesn't depend on request state.
  const orgId = ctx.organization.id;
  const orgName = ctx.organization.name;
  const actorId = ctx.profile.id;

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
        context: { reportId, title: finalTitle, kind },
        organizationId: orgId,
        actorId,
      });
      await markJobCompleted(jobId, {
        kind,
        title: finalTitle,
      });
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
        context: { reportId, prompt: prompt.slice(0, 200), kind },
        organizationId: orgId,
        actorId,
      });
      await markJobFailed(jobId, result.error ?? "report_failed");
    }
    revalidatePath("/dashboard/work/agent");
    revalidatePath(`/dashboard/work/agent/reports/${reportId}`);
  });

  return NextResponse.json({ ok: true, id: reportId });
}
