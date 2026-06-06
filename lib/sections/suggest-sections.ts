import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAnthropic, getModel } from "@/lib/ai/anthropic";
import { logAuditEvent } from "@/lib/data/audit-log";

const MIN_CLUSTER = 4;

export type ActiveSuggestion = {
  id: string;
  name: string;
  itemType: string | null;
  count: number;
};

/** The org's current pending section suggestion, if any (for the dashboard). */
export async function getActiveSectionSuggestion(orgId: string): Promise<ActiveSuggestion | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("section_suggestions")
    .select("id, suggested_name, item_type, item_ids")
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const r = data as {
    id: string;
    suggested_name: string;
    item_type: string | null;
    item_ids: string[];
  };
  return {
    id: r.id,
    name: r.suggested_name,
    itemType: r.item_type,
    count: r.item_ids?.length ?? 0,
  };
}

type Candidate = { id: string; vendor: string; title: string; type: string };

/**
 * After a scan, look at the user's Gmail-detected items and, if 4+ of them
 * share a theme that no existing section covers, propose a new section.
 * Best-effort and never throws. Uses one Haiku call to name the theme and pick
 * the members; persists a pending suggestion for the dashboard banner.
 */
export async function computeSectionSuggestions(userId: string, orgId: string): Promise<void> {
  try {
    const anthropic = getAnthropic();
    if (!anthropic) return;
    const admin = createAdminClient();

    // Already-pending suggestion? Don't pile up.
    const { data: existing } = await admin
      .from("section_suggestions")
      .select("id")
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    if (existing) return;

    const { data: itemRows } = await admin
      .from("email_detected_items")
      .select("id, item_type, extracted")
      .eq("user_id", userId)
      .in("status", ["pending", "approved"])
      .limit(120);
    const candidates: Candidate[] = (
      (itemRows as
        | {
            id: string;
            item_type: string;
            extracted: { vendor?: string | null; title?: string | null };
          }[]
        | null) ?? []
    )
      .map((r) => ({
        id: r.id,
        vendor: (r.extracted?.vendor ?? "").trim(),
        title: (r.extracted?.title ?? "").trim(),
        type: r.item_type,
      }))
      .filter((c) => c.vendor || c.title);
    if (candidates.length < MIN_CLUSTER) return;

    const { data: sections } = await admin
      .from("custom_sections")
      .select("name")
      .eq("organization_id", orgId);
    const existingNames = ((sections as { name: string }[] | null) ?? []).map((s) =>
      s.name.toLowerCase(),
    );

    const list = candidates
      .map((c, i) => `${i}. [${c.type}] ${c.vendor || "?"} - ${c.title || "?"}`)
      .join("\n");

    const prompt = `These are items found in someone's email. Group them by real-world theme (e.g. fitness, food delivery, streaming, pets, education). If at least ${MIN_CLUSTER} of them share a theme that is NOT already covered by an existing section, propose ONE new section.

Existing sections (do not propose these or close synonyms): ${existingNames.join(", ") || "none"}

Items:
${list}

Return ONLY JSON: {"section_name": "Title Case name or null", "item_type": "dominant item_type or null", "indexes": [list of item indexes in the theme]} . Return section_name null if no theme has ${MIN_CLUSTER}+ items.`;

    const msg = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned) as {
      section_name: string | null;
      item_type: string | null;
      indexes: number[];
    };
    if (
      !parsed.section_name ||
      !Array.isArray(parsed.indexes) ||
      parsed.indexes.length < MIN_CLUSTER
    ) {
      return;
    }
    if (existingNames.includes(parsed.section_name.toLowerCase())) return;

    const itemIds = parsed.indexes.map((i) => candidates[i]?.id).filter((x): x is string => !!x);
    if (itemIds.length < MIN_CLUSTER) return;

    const { data: inserted } = await admin
      .from("section_suggestions")
      .upsert(
        {
          organization_id: orgId,
          user_id: userId,
          suggested_name: parsed.section_name.slice(0, 60),
          item_type: parsed.item_type,
          item_ids: itemIds,
          status: "pending",
        },
        { onConflict: "organization_id,suggested_name", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();

    if (inserted) {
      await logAuditEvent({
        userId,
        organizationId: orgId,
        action: "section.suggested",
        resourceType: "section_suggestion",
        resourceId: (inserted as { id: string }).id,
        metadata: { name: parsed.section_name, count: itemIds.length },
      });
    }
  } catch {
    // Suggestions are a nice-to-have; never break a scan over them.
  }
}
