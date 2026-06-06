"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext } from "./organizations";
import { logAuditEvent } from "./audit-log";

const BUILTIN_SECTIONS = new Set<string>([
  "household",
  "travel",
  "properties",
  "staff",
  "events",
  "finance",
  "legal",
  "personal",
  "vendors",
  "health",
]);

/**
 * After a manual move, decide whether to offer to learn a vendor->section rule.
 * Returns the item's vendor when it is eligible (has a vendor, landed in a real
 * section, and we have neither a rule nor a suppression for it yet); else null.
 */
export async function maybeOfferRoutingRule(
  itemId: string,
  sectionKey: string,
): Promise<{ vendor: string } | null> {
  if (!itemId || !sectionKey) return null;
  const ctx = await requireContext();
  const admin = createAdminClient();

  const { data } = await admin
    .from("memory_items")
    .select("id, merchant, organization_id")
    .eq("id", itemId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  const row = data as { merchant: string | null } | null;
  const vendor = (row?.merchant ?? "").trim();
  if (!vendor) return null;

  // Already have a rule or a suppression for this vendor? Don't ask again.
  const { data: existing } = await admin
    .from("learned_routing_rules")
    .select("id")
    .eq("user_id", ctx.profile.id)
    .eq("organization_id", ctx.organization.id)
    .eq("match_type", "vendor")
    .eq("match_value", vendor.toLowerCase())
    .maybeSingle();
  if (existing) return null;

  return { vendor };
}

/** Yes: learn the rule. Future matching items route to this section. */
export async function confirmRoutingRule(
  vendor: string,
  sectionKey: string,
): Promise<{ ok: boolean }> {
  const v = (vendor ?? "").trim().toLowerCase();
  if (!v || !sectionKey) return { ok: false };
  const ctx = await requireContext();
  const admin = createAdminClient();

  const { data } = await admin
    .from("learned_routing_rules")
    .upsert(
      {
        user_id: ctx.profile.id,
        organization_id: ctx.organization.id,
        match_type: "vendor",
        match_value: v,
        target_section_key: sectionKey,
        source: "user_confirmed",
      },
      { onConflict: "user_id,organization_id,match_type,match_value" },
    )
    .select("id")
    .maybeSingle();

  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "routing_rule_learned",
    resourceType: "learned_routing_rule",
    resourceId: (data as { id: string } | null)?.id ?? null,
    metadata: {
      match_type: "vendor",
      match_value: v,
      target_section_key: BUILTIN_SECTIONS.has(sectionKey) ? sectionKey : "custom",
    },
  });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/** No: never ask about this vendor again (store a suppression). */
export async function suppressRoutingRule(vendor: string): Promise<{ ok: boolean }> {
  const v = (vendor ?? "").trim().toLowerCase();
  if (!v) return { ok: false };
  const ctx = await requireContext();
  const admin = createAdminClient();
  await admin.from("learned_routing_rules").upsert(
    {
      user_id: ctx.profile.id,
      organization_id: ctx.organization.id,
      match_type: "vendor",
      match_value: v,
      target_section_key: "",
      source: "suppressed",
    },
    { onConflict: "user_id,organization_id,match_type,match_value" },
  );
  return { ok: true };
}

/** Remove a learned rule from the Preferences list. */
export async function removeRoutingRule(ruleId: string): Promise<{ ok: boolean }> {
  if (!ruleId) return { ok: false };
  const ctx = await requireContext();
  const admin = createAdminClient();
  const { data } = await admin
    .from("learned_routing_rules")
    .delete()
    .eq("id", ruleId)
    .eq("user_id", ctx.profile.id)
    .select("match_value")
    .maybeSingle();
  if (!data) return { ok: false };

  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "routing_rule_removed",
    resourceType: "learned_routing_rule",
    resourceId: ruleId,
    metadata: { match_value: (data as { match_value: string }).match_value },
  });
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
