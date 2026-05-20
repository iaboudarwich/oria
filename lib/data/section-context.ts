import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_BUILTIN_ORDER } from "./all-sections";
import type { Section } from "@/lib/supabase/types";

/**
 * The "context" Oria knows about a section. Today's signal: keywords driving
 * data-driven classification; purpose used by AI prompts elsewhere. Future
 * fields (entities, file_types, calendar_patterns, ...) can be added without
 * a migration since this lives in jsonb.
 */
export type SectionContext = {
  keywords: string[];
  purpose?: string;
};

/**
 * Calm starting points for each built-in section. Per-org context (stored in
 * section_settings.context) is merged on top; user actions enrich it over
 * time via learning_events.
 *
 * Each keyword is matched case-insensitively as a substring against the
 * upload filename + (eventually) extracted text. Short keywords (< 3 chars)
 * are skipped to avoid false positives.
 */
export const BUILTIN_DEFAULT_CONTEXT: Record<Section, SectionContext> = {
  household: {
    keywords: ["bill", "utility", "appliance", "warranty", "manual"],
    purpose: "Day-to-day home: bills, utilities, appliances, warranties.",
  },
  travel: {
    keywords: [
      "flight",
      "ticket",
      "itinerary",
      "boarding",
      "hotel",
      "trip",
      "reservation",
      "airbnb",
    ],
    purpose: "Trips, flights, hotels, itineraries.",
  },
  properties: {
    keywords: ["lease", "rent", "deed", "mortgage", "property", "tenant"],
    purpose: "Homes and properties you own or rent.",
  },
  staff: {
    keywords: ["payroll", "schedule", "shift", "employee", "contractor"],
    purpose: "People who work for you or with you.",
  },
  events: {
    keywords: [
      "invitation",
      "rsvp",
      "wedding",
      "birthday",
      "party",
      "event",
      "save the date",
    ],
    purpose: "Personal events, gatherings, invitations.",
  },
  finance: {
    keywords: [
      "receipt",
      "invoice",
      "statement",
      "bill",
      "payment",
      "transfer",
      "bank",
      "tax",
      "refund",
    ],
    purpose: "Money in, money out. Receipts, invoices, statements.",
  },
  legal: {
    keywords: ["contract", "agreement", "nda", "policy", "court", "notarized"],
    purpose: "Contracts, agreements, anything legal.",
  },
  personal: {
    keywords: ["id", "passport", "license", "diploma", "certificate", "note"],
    purpose: "Personal identity documents and notes.",
  },
  vendors: {
    keywords: ["vendor", "service", "quote", "estimate", "supplier"],
    purpose: "People you pay for services.",
  },
  health: {
    keywords: [
      "prescription",
      "rx",
      "doctor",
      "medical",
      "lab",
      "test result",
      "insurance card",
    ],
    purpose: "Medical, dental, prescriptions, health records.",
  },
};

/**
 * Resolved context for one section in one org, with its sort/identity info.
 * Used by the classifier + future retrieval.
 */
export type ResolvedSectionContext =
  | {
      kind: "builtin";
      key: Section;
      name: string;
      context: SectionContext;
    }
  | {
      kind: "custom";
      key: string; // custom_section_id
      name: string;
      context: SectionContext;
    };

/**
 * Load every section in the org along with its merged context.
 *
 *   • Built-in: defaults + section_settings.context (per-org enrichment)
 *   • Custom:   distilled from custom_sections.profile (kinds, related, etc.)
 */
export async function getOrgSectionContexts(
  organizationId: string,
): Promise<ResolvedSectionContext[]> {
  const supabase = await createClient();

  const [settingsRes, customRes] = await Promise.all([
    supabase
      .from("section_settings")
      .select("builtin_section, custom_section_id, context, hidden")
      .eq("organization_id", organizationId),
    supabase
      .from("custom_sections")
      .select("id, name, profile")
      .eq("organization_id", organizationId),
  ]);

  const settingsByBuiltin = new Map<
    Section,
    { context: unknown; hidden: boolean | null }
  >();
  for (const s of (settingsRes.data ?? []) as Array<{
    builtin_section: Section | null;
    custom_section_id: string | null;
    context: unknown;
    hidden: boolean | null;
  }>) {
    if (s.builtin_section) {
      settingsByBuiltin.set(s.builtin_section, {
        context: s.context,
        hidden: s.hidden,
      });
    }
  }

  const out: ResolvedSectionContext[] = [];

  for (const key of DEFAULT_BUILTIN_ORDER) {
    const setting = settingsByBuiltin.get(key);
    if (setting?.hidden) continue;
    const defaults = BUILTIN_DEFAULT_CONTEXT[key];
    const learned = parseContext(setting?.context);
    out.push({
      kind: "builtin",
      key,
      name: BUILTIN_LABEL[key],
      context: mergeContext(defaults, learned),
    });
  }

  for (const c of (customRes.data ?? []) as Array<{
    id: string;
    name: string;
    profile: unknown;
  }>) {
    out.push({
      kind: "custom",
      key: c.id,
      name: c.name,
      context: contextFromCustomProfile(c.name, c.profile),
    });
  }

  return out;
}

function parseContext(raw: unknown): SectionContext {
  if (!raw || typeof raw !== "object") return { keywords: [] };
  const r = raw as Record<string, unknown>;
  const keywords = Array.isArray(r.keywords)
    ? (r.keywords as unknown[]).filter((k): k is string => typeof k === "string")
    : [];
  const purpose = typeof r.purpose === "string" ? r.purpose : undefined;
  return { keywords, purpose };
}

function mergeContext(
  base: SectionContext,
  extra: SectionContext,
): SectionContext {
  const all = [...base.keywords, ...extra.keywords]
    .map((k) => k.toLowerCase().trim())
    .filter((k) => k.length >= 2);
  return {
    keywords: Array.from(new Set(all)),
    purpose: extra.purpose ?? base.purpose,
  };
}

function contextFromCustomProfile(
  name: string,
  profile: unknown,
): SectionContext {
  const keywords: string[] = [name.toLowerCase()];
  const p =
    profile && typeof profile === "object"
      ? (profile as Record<string, unknown>)
      : null;
  if (p) {
    if (Array.isArray(p.kinds)) {
      for (const k of p.kinds) keywords.push(String(k).toLowerCase());
    }
    if (typeof p.related === "string") {
      for (const r of p.related.split(/[,;]/)) {
        const v = r.trim().toLowerCase();
        if (v.length >= 3) keywords.push(v);
      }
    }
  }
  return {
    keywords: Array.from(new Set(keywords.filter((k) => k.length >= 2))),
    purpose:
      p && typeof p.mode === "string" ? `Mode: ${p.mode}` : undefined,
  };
}

const BUILTIN_LABEL: Record<Section, string> = {
  household: "Household",
  travel: "Travel",
  properties: "Properties",
  staff: "Staff",
  events: "Events",
  finance: "Finance",
  legal: "Legal",
  personal: "Personal",
  vendors: "Vendors",
  health: "Health",
};

/**
 * Pick the best section for a piece of free text (filename today, OCR
 * tomorrow). Scores by counting case-insensitive substring matches of each
 * section's keywords. Returns null if nothing scores above the floor, which
 * sends the upload to Unsorted.
 */
export function pickBestSection(
  text: string,
  sections: ResolvedSectionContext[],
): ResolvedSectionContext | null {
  const hay = text.toLowerCase();
  let best: { section: ResolvedSectionContext; score: number } | null = null;

  for (const s of sections) {
    let score = 0;
    for (const kw of s.context.keywords) {
      if (kw.length < 3) continue; // avoid 2-char false positives
      if (hay.includes(kw)) score += kw.length; // longer matches weigh more
    }
    if (score === 0) continue;
    if (!best || score > best.score) best = { section: s, score };
  }

  return best?.section ?? null;
}
