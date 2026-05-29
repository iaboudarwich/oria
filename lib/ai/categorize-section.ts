import "server-only";

import { getAnthropic, getModel } from "@/lib/ai/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordSystemEvent } from "@/lib/data/system-events";
import type { Section } from "@/lib/supabase/types";

export type CategoryResult = {
  section: Section | null;
  customSectionId: string | null;
  confidence: number;
  reasoning: string;
};

/**
 * Hard-coded doc_type → builtin section mapping.
 * Applied before any AI call. confidence = 1.0.
 */
const HARD_MAP: Record<string, Section> = {
  flight: "travel",
  prescription: "health",
  id_document: "personal",
  lease: "household",
  statement: "finance",
  invoice: "finance",
  contract: "legal",
};

/**
 * Product sub-category → builtin section.
 * Applied when doc_type === "product".
 */
const PRODUCT_MAP: Record<string, Section> = {
  food: "health",       // no "diet" builtin — route to health
  beverage: "health",
  supplement: "health",
  cosmetic: "household",
  household: "household",
};

/**
 * Infer the best section for an upload based on its extracted_entities row.
 * Returns the builtin section slug, custom section id, confidence, and
 * a one-sentence reasoning string for the audit log.
 */
export async function inferSection(uploadId: string): Promise<CategoryResult> {
  const admin = createAdminClient();

  // ── Read extracted entities ─────────────────────────────────────────────
  const { data: entity } = await admin
    .from("extracted_entities")
    .select("doc_type, fields, user_edited_fields, user_verified")
    .eq("upload_id", uploadId)
    .maybeSingle();

  if (!entity) {
    return { section: null, customSectionId: null, confidence: 0, reasoning: "No extracted entities found." };
  }

  const docType = String(entity.doc_type ?? "generic");
  const fields = (entity.user_verified && entity.user_edited_fields
    ? { ...(entity.fields as Record<string, unknown>), ...(entity.user_edited_fields as Record<string, unknown>) }
    : (entity.fields as Record<string, unknown>));

  // ── Hard-coded mapping ──────────────────────────────────────────────────
  if (HARD_MAP[docType]) {
    return {
      section: HARD_MAP[docType],
      customSectionId: null,
      confidence: 1.0,
      reasoning: `Hard-coded rule: ${docType} → ${HARD_MAP[docType]}.`,
    };
  }

  // Product sub-type mapping
  if (docType === "product") {
    const category = String(fields.category ?? "");
    if (PRODUCT_MAP[category]) {
      return {
        section: PRODUCT_MAP[category],
        customSectionId: null,
        confidence: 0.9,
        reasoning: `Product category "${category}" mapped to ${PRODUCT_MAP[category]}.`,
      };
    }
  }

  // ── Read the upload's org to know which sections are available ──────────
  const { data: upload } = await admin
    .from("uploads")
    .select("organization_id")
    .eq("id", uploadId)
    .maybeSingle();

  if (!upload) {
    return { section: null, customSectionId: null, confidence: 0, reasoning: "Upload not found." };
  }

  const orgId = upload.organization_id as string;

  // Read custom sections for this org.
  const { data: customRows } = await admin
    .from("custom_sections")
    .select("id, name, description")
    .eq("organization_id", orgId);

  const customSections = (
    (customRows ?? []) as Array<{ id: string; name: string; description: string | null }>
  ).map((r) => ({ kind: "custom" as const, key: r.id, name: r.name, description: r.description }));

  // ── AI classification ───────────────────────────────────────────────────
  const anthropic = getAnthropic();
  if (!anthropic) {
    return { section: null, customSectionId: null, confidence: 0, reasoning: "AI not configured." };
  }

  // Build a summary of the document from fields.
  const summaryParts: string[] = [`Type: ${docType}`];
  for (const [k, v] of Object.entries(fields).slice(0, 5)) {
    if (v != null && typeof v !== "object") {
      summaryParts.push(`${k}: ${String(v).slice(0, 80)}`);
    }
  }
  const summary = summaryParts.join(", ");

  const builtinList = [
    "household: leases, repairs, home services, home insurance",
    "travel: flights, hotels, itineraries, travel insurance",
    "finance: bank statements, investments, taxes, receipts",
    "legal: contracts, NDAs, agreements, legal documents",
    "personal: IDs, passports, personal certificates",
    "health: prescriptions, medical records, lab results",
    "properties: property deeds, property management",
    "staff: employment contracts, staff documents",
    "events: event tickets, event planning",
    "vendors: vendor contracts, supplier documents",
  ].join("\n");

  const customList = customSections.length > 0
    ? customSections
        .map((s) => `${s.name}: ${s.description ?? "custom section"}`)
        .join("\n")
    : "(none)";

  const prompt = `You are a filing assistant. Given a document, pick the best section.

Document: ${summary}

Built-in sections:
${builtinList}

Custom sections:
${customList}

Reply with ONLY valid JSON:
{"section": "<builtin_slug or custom section name or null>", "confidence": <0-1>, "reasoning": "<one sentence>"}

If nothing fits, use null. Use a builtin slug (lowercase) when it matches well. Use the exact custom section name when it fits better.`;

  try {
    const msg = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned) as {
      section?: string | null;
      confidence?: number;
      reasoning?: string;
    };

    const sectionName = parsed.section ?? null;
    const confidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5;
    const reasoning = typeof parsed.reasoning === "string"
      ? parsed.reasoning
      : "AI classification.";

    if (!sectionName) {
      return { section: null, customSectionId: null, confidence, reasoning };
    }

    // Check if it matches a builtin slug.
    const BUILTIN_SLUGS: Section[] = [
      "household", "travel", "properties", "staff", "events",
      "finance", "legal", "personal", "vendors", "health",
    ];
    if (BUILTIN_SLUGS.includes(sectionName as Section)) {
      return {
        section: sectionName as Section,
        customSectionId: null,
        confidence,
        reasoning,
      };
    }

    // Check if it matches a custom section name.
    const matched = customSections.find(
      (s) => s.name.toLowerCase() === sectionName.toLowerCase(),
    );
    if (matched) {
      return {
        section: null,
        customSectionId: matched.key,
        confidence,
        reasoning,
      };
    }

    // No match found.
    return { section: null, customSectionId: null, confidence: 0.3, reasoning };
  } catch (err) {
    void recordSystemEvent({
      kind: "ai.error",
      severity: "warn",
      message: `inferSection failed: ${err instanceof Error ? err.message : "unknown"}`,
      context: { uploadId },
      organizationId: orgId,
    });
    return { section: null, customSectionId: null, confidence: 0, reasoning: "AI classification failed." };
  }
}
