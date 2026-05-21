import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentContext } from "@/lib/data/organizations";
import { createClient } from "@/lib/supabase/server";
import { generateWorkReport } from "@/lib/ai/work-report";
import { checkDailyAskRequests } from "@/lib/data/quotas";
import { recordSystemEvent } from "@/lib/data/system-events";

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

  // Generate in the background so the POST returns immediately. The UI
  // polls listWorkspaceReports / report detail to pick up the ready row.
  after(async () => {
    const result = await generateWorkReport({ prompt, kind });
    const supabase2 = await createClient();
    if (result.ok) {
      await supabase2
        .from("workspace_reports")
        .update({
          title: result.title || prompt.slice(0, 80),
          payload: result.payload,
          status: "ready",
          updated_at: new Date().toISOString(),
        })
        .eq("id", reportId);
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
        organizationId: ctx.organization.id,
        actorId: ctx.profile.id,
      });
    }
    revalidatePath("/dashboard/work/agent");
    revalidatePath(`/dashboard/work/agent/reports/${reportId}`);
  });

  return NextResponse.json({ ok: true, id: reportId });
}
