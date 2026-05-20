"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";

/**
 * Delete a generated report. Any member of the Workspace may delete;
 * RLS enforces org membership at the DB level too. Redirects back to the
 * Work AI home so the deleted report's URL doesn't 404.
 */
export async function deleteWorkspaceReport(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const ctx = await requireContext();
  if (ctx.organization.kind !== "office") return;

  const supabase = await createClient();
  await supabase
    .from("workspace_reports")
    .delete()
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);

  revalidatePath("/dashboard/work/agent");
  redirect("/dashboard/work/agent");
}
