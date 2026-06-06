"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";

export type SaveContextResult = { ok: true } | { ok: false; error: string };

/**
 * Upsert the Workspace context the AI agent uses. Office orgs only; any
 * member can save. The form sends free-text description + instructions
 * plus a comma-separated list of preferred metrics.
 */
export async function saveWorkspaceContext(formData: FormData): Promise<SaveContextResult> {
  const ctx = await requireContext();
  if (ctx.organization.kind !== "office") {
    return { ok: false, error: "Workspace context is for Work mode only." };
  }

  const description =
    String(formData.get("description") ?? "")
      .trim()
      .slice(0, 1000) || null;
  const instructions =
    String(formData.get("ai_instructions") ?? "")
      .trim()
      .slice(0, 2000) || null;
  const metricsRaw = String(formData.get("preferred_metrics") ?? "").trim();
  const metrics = metricsRaw
    ? metricsRaw
        .split(/[,\n]/)
        .map((m) => m.trim())
        .filter(Boolean)
        .slice(0, 20)
    : [];
  const style =
    String(formData.get("preferred_report_style") ?? "")
      .trim()
      .slice(0, 40) || null;

  const supabase = await createClient();
  const { error } = await supabase.from("workspace_context").upsert(
    {
      organization_id: ctx.organization.id,
      description,
      ai_instructions: instructions,
      preferred_metrics: metrics,
      preferred_report_style: style,
      updated_by: ctx.profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/work/agent");
  return { ok: true };
}
