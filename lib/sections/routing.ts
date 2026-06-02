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

const BUILTIN_SECTIONS = new Set<string>([
  "household", "travel", "properties", "staff", "events",
  "finance", "legal", "personal", "vendors", "health",
]);

/** Domain from a raw "From" header, e.g. "Stripe <a@b.stripe.com>" -> "stripe.com". */
export function senderDomain(from: string | null | undefined): string | null {
  if (!from) return null;
  const m = from.match(/[\w.+-]+@([\w.-]+)/);
  if (!m) return null;
  const parts = m[1].toLowerCase().split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : m[1].toLowerCase();
}

/** Turn a stored target_section_key into a RouteTarget (builtin vs custom). */
async function resolveSectionKey(orgId: string, key: string): Promise<RouteTarget> {
  if (!key) return null;
  if (BUILTIN_SECTIONS.has(key)) {
    return { kind: "builtin", section: key as Section, customSectionId: null, name: key };
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("custom_sections")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("id", key)
    .maybeSingle();
  if (!data) return null;
  const row = data as { id: string; name: string };
  return { kind: "custom", section: null, customSectionId: row.id, name: row.name };
}

type LearnedRule = { match_type: string; match_value: string; target_section_key: string };

/** Most specific user-confirmed rule that matches this item, or null. */
async function matchLearnedRule(input: {
  userId: string;
  orgId: string;
  itemType: string;
  vendor: string | null;
  senderDomain: string | null;
  keywordText: string | null;
}): Promise<RouteTarget> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("learned_routing_rules")
    .select("match_type, match_value, target_section_key")
    .eq("user_id", input.userId)
    .eq("organization_id", input.orgId)
    .eq("source", "user_confirmed");
  const rules = (data as LearnedRule[] | null) ?? [];
  if (rules.length === 0) return null;

  const vendor = (input.vendor ?? "").trim().toLowerCase();
  const hay = (input.keywordText ?? "").toLowerCase();
  // Priority: vendor (most specific) > sender_domain > item_type > keyword.
  const order = ["vendor", "sender_domain", "item_type", "keyword"];
  for (const mt of order) {
    const hit = rules.find((r) => {
      if (r.match_type !== mt) return false;
      if (mt === "vendor") return !!vendor && r.match_value === vendor;
      if (mt === "sender_domain") return !!input.senderDomain && r.match_value === input.senderDomain;
      if (mt === "item_type") return r.match_value === input.itemType;
      if (mt === "keyword") return !!r.match_value && hay.includes(r.match_value.toLowerCase());
      return false;
    });
    if (hit) {
      const target = await resolveSectionKey(input.orgId, hit.target_section_key);
      if (target) return target;
    }
  }
  return null;
}

/**
 * Resolve the section a detected item should route to. Order:
 *   1. a user-confirmed learned rule (corrections win),
 *   2. a custom section that opted into the type,
 *   3. the built-in default map.
 * Appointments only route to Health when they are medical. null = no home.
 */
export async function findSectionForItem(input: {
  itemType: string;
  appointmentType?: string | null;
  orgId: string;
  userId: string;
  vendor?: string | null;
  senderDomain?: string | null;
  keywordText?: string | null;
}): Promise<RouteTarget> {
  const admin = createAdminClient();

  // 1. Learned rules win.
  const learned = await matchLearnedRule({
    userId: input.userId,
    orgId: input.orgId,
    itemType: input.itemType,
    vendor: input.vendor ?? null,
    senderDomain: input.senderDomain ?? null,
    keywordText: input.keywordText ?? null,
  });
  if (learned) return learned;

  // 2. Custom section opting into this type.
  const { data } = await admin
    .from("custom_sections")
    .select("id, name")
    .eq("organization_id", input.orgId)
    .contains("auto_route_types", [input.itemType])
    .limit(1)
    .maybeSingle();
  if (data) {
    const row = data as { id: string; name: string };
    return { kind: "custom", section: null, customSectionId: row.id, name: row.name };
  }

  // 3. Built-in default map.
  if (input.itemType === "appointment") {
    if (input.appointmentType === "medical") {
      return { kind: "builtin", section: "health", customSectionId: null, name: "Health" };
    }
    return null;
  }
  const builtin = BUILTIN_ROUTES[input.itemType];
  if (builtin) return { kind: "builtin", section: builtin, customSectionId: null, name: builtin };
  return null;
}

/** Does a user-confirmed vendor rule exist for this user/org? (auto-route boost) */
export async function hasLearnedVendorRule(
  userId: string,
  orgId: string,
  vendor: string | null,
): Promise<boolean> {
  const v = (vendor ?? "").trim().toLowerCase();
  if (!v) return false;
  const admin = createAdminClient();
  const { data } = await admin
    .from("learned_routing_rules")
    .select("id")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .eq("match_type", "vendor")
    .eq("match_value", v)
    .eq("source", "user_confirmed")
    .maybeSingle();
  return !!data;
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
