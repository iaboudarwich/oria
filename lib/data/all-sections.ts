import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type {
  CustomSection,
  Section,
  SectionSetting,
} from "@/lib/supabase/types";

/**
 * Canonical default order for built-in sections. Custom sections come after
 * by default, in their own creation order.
 */
export const DEFAULT_BUILTIN_ORDER: Section[] = [
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
];

export type SectionRef =
  | { kind: "builtin"; key: Section }
  | { kind: "custom"; key: string }
  | { kind: "review"; key: "review" };

export type MergedSection = {
  ref: SectionRef;
  name: string;
  href: string;
  sort_order: number;
  hidden: boolean;
  /** Item count is computed by the caller when needed (it's not always cheap). */
};

/** Pseudo-section: items Oria couldn't confidently classify. "Unsorted" is
 * the calmest label we tried: descriptive, never alarmist, and the obvious
 * next action is to sort.
 *
 * Invariants. DO NOT WEAKEN:
 *   • Always present in every space (personal, circle, office). Implemented
 *     by injecting this constant into listAllSections rather than storing a
 *     row. There is no DELETE path that can remove it.
 *   • Cannot be hidden by the user. The Settings UI does not expose a
 *     "hide Unsorted" toggle; we pin `hidden: false` here as the single
 *     source of truth.
 *   • Not a database row. RLS, foreign keys, and section_settings have
 *     nothing to point at, which is the point. there is nothing to scope
 *     across orgs, nothing to delete by accident, nothing to migrate. */
export const REVIEW_SECTION: MergedSection = {
  ref: { kind: "review", key: "review" },
  name: "Unsorted",
  href: "/dashboard/sections/review",
  sort_order: -1, // always first, ahead of "household"
  hidden: false,
};

const BUILTIN_LABELS: Record<Section, string> = {
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
 * Returns every section the user has (built-in + custom + the Review pseudo-
 * section), already merged with their per-org settings and sorted. Hidden
 * sections are included by default for the Settings management UI; pass
 * { includeHidden: false } for places that should only show what's currently
 * active.
 *
 * The Review pseudo-section is always present (can be hidden but not removed)
 * unless `includeReview` is explicitly false. used by callers like the
 * limited-access section picker where Review doesn't make sense.
 */
export async function listAllSections(
  opts: { includeHidden?: boolean; includeReview?: boolean } = {},
): Promise<MergedSection[]> {
  const { includeHidden = true, includeReview = true } = opts;
  const ctx = await requireContext();
  const supabase = await createClient();

  const [customRes, settingsRes] = await Promise.all([
    supabase
      .from("custom_sections")
      .select("*")
      .eq("organization_id", ctx.organization.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("section_settings")
      .select("*")
      .eq("organization_id", ctx.organization.id),
  ]);

  const customSections = (customRes.data ?? []) as CustomSection[];
  const settings = (settingsRes.data ?? []) as SectionSetting[];

  const settingByBuiltin = new Map<Section, SectionSetting>();
  const settingByCustom = new Map<string, SectionSetting>();
  for (const s of settings) {
    if (s.builtin_section) settingByBuiltin.set(s.builtin_section, s);
    if (s.custom_section_id) settingByCustom.set(s.custom_section_id, s);
  }

  const merged: MergedSection[] = [];

  // Review is always pinned to the top, never hidden. It's a meta-section,
  // not a user-managed one.
  if (includeReview) {
    merged.push({ ...REVIEW_SECTION });
  }

  DEFAULT_BUILTIN_ORDER.forEach((key, idx) => {
    const s = settingByBuiltin.get(key);
    merged.push({
      ref: { kind: "builtin", key },
      name: BUILTIN_LABELS[key],
      href: `/dashboard/sections/${key}`,
      sort_order: s?.sort_order ?? idx * 10,
      hidden: s?.hidden ?? false,
    });
  });

  customSections.forEach((c, idx) => {
    const s = settingByCustom.get(c.id);
    merged.push({
      ref: { kind: "custom", key: c.id },
      name: c.name,
      href: `/dashboard/sections/${c.id}`,
      sort_order: s?.sort_order ?? 1000 + idx * 10,
      hidden: s?.hidden ?? false,
    });
  });

  merged.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });

  return includeHidden ? merged : merged.filter((m) => !m.hidden);
}

export function isSameRef(a: SectionRef, b: SectionRef): boolean {
  return a.kind === b.kind && a.key === b.key;
}

export function isReviewRef(r: SectionRef): boolean {
  return r.kind === "review";
}
