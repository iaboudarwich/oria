"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { applyTemplate, type TemplateKey } from "@/lib/data/workspace-templates";

/**
 * Accept a template choice from the onboarding page.
 * Applies the template to the user's active (personal) workspace and
 * redirects to /dashboard.
 */
export async function chooseTemplate(formData: FormData): Promise<void> {
  const templateKey = String(formData.get("template") ?? "custom") as TemplateKey;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Find the user's personal org (the one they were bootstrapped into).
  const { data: memberships } = await supabase
    .from("memberships")
    .select("organization_id, organizations(id, kind, template_key)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const personal = (memberships ?? []).find((m) => {
    const org = (m as Record<string, unknown>).organizations as Record<string, unknown> | null;
    return org?.kind === "personal";
  });

  if (personal) {
    const orgId = personal.organization_id as string;
    await applyTemplate(orgId, templateKey);
  }

  redirect("/dashboard");
}
