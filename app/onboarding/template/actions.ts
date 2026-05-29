"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  applyTemplates,
  type TemplateKey,
} from "@/lib/data/workspace-templates";

const VALID_KEYS = new Set<TemplateKey>([
  "personal",
  "investor",
  "business",
  "family_office",
  "custom",
]);

/**
 * Accept one or more template choices from the onboarding picker.
 *
 * The picker submits a FormData with `template` entries — one per
 * selected card. We validate against the known set (a forged value
 * can't seed unexpected sections), apply the merged template, then
 * redirect to the guided chat carrying the chosen keys so the AI's
 * opening context knows what the user just picked.
 *
 * An empty / Skip selection collapses to "custom" so the org still
 * gets a stamped template_key and bypasses this page on the next visit.
 */
export async function chooseTemplates(formData: FormData): Promise<void> {
  const rawValues = formData
    .getAll("template")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const keys: TemplateKey[] = rawValues
    .filter((v): v is TemplateKey => VALID_KEYS.has(v as TemplateKey));

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

  let orgId: string | null = null;
  if (personal) {
    orgId = personal.organization_id as string;
    // An empty selection is treated as "custom" so applyTemplates still
    // stamps the org and we don't keep redirecting back to this page.
    const toApply: TemplateKey[] = keys.length === 0 ? ["custom"] : keys;
    await applyTemplates(orgId, toApply);
  }

  // Carry the real (non-custom) selections into the guided chat so the
  // AI's opening context can personalize off them. `custom` is omitted
  // — it carries no signal.
  const carried = keys.filter((k) => k !== "custom");

  if (orgId) {
    const qs = new URLSearchParams({ mode: "first", workspace: orgId });
    if (carried.length > 0) qs.set("templates", carried.join(","));
    redirect(`/onboarding/chat?${qs.toString()}`);
  }
  redirect("/dashboard");
}
