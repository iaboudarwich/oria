import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Section } from "@/lib/supabase/types";

/** Where a detected item should land. null = no good home (route to inbox). */
export type RouteTarget =
  | { kind: "builtin"; section: Section; customSectionId: null; name: string }
  | { kind: "custom"; section: null; customSectionId: string; name: string }
  | null;

/**
 * Default type -> built-in section. This is the in-code equivalent of the
 * pre-populated auto_route_types the spec describes for built-in sections
 * (which are an enum, not rows, so they cannot carry the column).
 */
const BUILTIN_ROUTES: Record<string, Section> = {
  receipt: "finance",
  bill: "finance",
  subscription: "finance",
  flight: "travel",
  booking: "travel",
};

/**
 * Resolve the section a detected item should route to. A custom section that
 * opted into the type wins; otherwise the built-in default map; otherwise null.
 * Appointments only route to Health when they are medical.
 */
export async function findSectionForItem(
  itemType: string,
  appointmentType: string | null,
  orgId: string,
): Promise<RouteTarget> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("custom_sections")
    .select("id, name")
    .eq("organization_id", orgId)
    .contains("auto_route_types", [itemType])
    .limit(1)
    .maybeSingle();
  if (data) {
    const row = data as { id: string; name: string };
    return { kind: "custom", section: null, customSectionId: row.id, name: row.name };
  }

  if (itemType === "appointment") {
    if (appointmentType === "medical") {
      return { kind: "builtin", section: "health", customSectionId: null, name: "Health" };
    }
    return null;
  }

  const builtin = BUILTIN_ROUTES[itemType];
  if (builtin) return { kind: "builtin", section: builtin, customSectionId: null, name: builtin };
  return null;
}

/**
 * Create the section entry (a typed memory_item with no source file) that makes
 * an approved Gmail item show up in its section's view. Best-effort.
 */
export async function routeItemToSection(input: {
  orgId: string;
  target: NonNullable<RouteTarget>;
  detectedItemId: string;
  title: string;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  occurredAt: string | null;
  summary: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from("memory_items").insert({
    organization_id: input.orgId,
    upload_id: null,
    section: input.target.section,
    custom_section_id: input.target.customSectionId,
    title: input.title,
    summary: input.summary,
    merchant: input.vendor,
    amount_value: input.amount != null ? String(input.amount) : null,
    amount_currency: input.currency,
    amount_normalized: input.amount ?? null,
    occurred_at: input.occurredAt,
    facts: { source: "gmail", detected_item_id: input.detectedItemId },
  });
}
