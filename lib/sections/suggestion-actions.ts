"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContext } from "@/lib/data/organizations";
import { logAuditEvent } from "@/lib/data/audit-log";
import { applyDetectedItem } from "@/lib/integrations/gmail/apply";

type SuggestionRow = {
  id: string;
  organization_id: string;
  suggested_name: string;
  item_type: string | null;
  item_ids: string[];
  status: string;
};

/**
 * Accept a section suggestion: create the section (opted into the suggested
 * item type), retroactively route the matched items into it, mark the
 * suggestion accepted, and audit.
 */
export async function acceptSectionSuggestion(id: string): Promise<{ ok: boolean }> {
  const ctx = await getCurrentContext();
  if (!ctx) return { ok: false };
  const admin = createAdminClient();

  const { data } = await admin
    .from("section_suggestions")
    .select("id, organization_id, suggested_name, item_type, item_ids, status")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .eq("status", "pending")
    .maybeSingle();
  const sugg = data as SuggestionRow | null;
  if (!sugg) return { ok: false };

  const autoRouteTypes = sugg.item_type ? [sugg.item_type] : [];
  const { data: sectionRow } = await admin
    .from("custom_sections")
    .insert({
      organization_id: ctx.organization.id,
      name: sugg.suggested_name,
      auto_route_types: autoRouteTypes,
      created_by: ctx.profile.id,
    })
    .select("id")
    .single();
  const sectionId = (sectionRow as { id: string } | null)?.id;
  if (!sectionId) return { ok: false };

  // Retroactively route the matched items.
  for (const itemId of sugg.item_ids) {
    const { data: itemRow } = await admin
      .from("email_detected_items")
      .select("id, status, item_type, source_subject, source_date, extracted")
      .eq("id", itemId)
      .eq("user_id", ctx.profile.id)
      .maybeSingle();
    const item = itemRow as
      | {
          id: string;
          status: string;
          item_type: string;
          source_subject: string | null;
          source_date: string | null;
          extracted: Record<string, unknown>;
        }
      | null;
    if (!item) continue;

    if (item.status === "pending") {
      // Routes into the new section automatically (it now opts into the type).
      await applyDetectedItem({ itemId, userId: ctx.profile.id, orgId: ctx.organization.id });
    } else if (item.status === "approved") {
      const ex = item.extracted as {
        title?: string;
        vendor?: string | null;
        amount?: number | null;
        currency?: string | null;
        summary?: string | null;
        event_date?: string | null;
        renewal_date?: string | null;
      };
      await admin.from("memory_items").insert({
        organization_id: ctx.organization.id,
        upload_id: null,
        custom_section_id: sectionId,
        title: ex.title || item.source_subject || "Item",
        summary: ex.summary ?? null,
        merchant: ex.vendor ?? null,
        amount_value: ex.amount != null ? String(ex.amount) : null,
        amount_currency: ex.currency ?? null,
        amount_normalized: ex.amount ?? null,
        occurred_at: ex.event_date ?? ex.renewal_date ?? item.source_date,
        facts: { source: "gmail", detected_item_id: item.id },
      });
      await admin
        .from("email_detected_items")
        .update({ routed_custom_section_id: sectionId })
        .eq("id", item.id);
    }
  }

  await admin
    .from("section_suggestions")
    .update({ status: "accepted" })
    .eq("id", sugg.id);

  await logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "section.created_from_suggestion",
    resourceType: "custom_section",
    resourceId: sectionId,
    metadata: { name: sugg.suggested_name, item_count: sugg.item_ids.length },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/** Dismiss a section suggestion so the banner stops showing it. */
export async function dismissSectionSuggestion(id: string): Promise<{ ok: boolean }> {
  const ctx = await getCurrentContext();
  if (!ctx) return { ok: false };
  const admin = createAdminClient();
  await admin
    .from("section_suggestions")
    .update({ status: "dismissed" })
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);
  revalidatePath("/dashboard");
  return { ok: true };
}
