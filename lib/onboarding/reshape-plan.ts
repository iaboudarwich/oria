import "server-only";

import { infraComplete } from "@/lib/ai-providers";
import { EMPTY_PATCH, type PlanPatch, type PlanSection, type WorkspacePlan } from "./types";

const LANG: Record<string, string> = { en: "English", ar: "Arabic", fr: "French", es: "Spanish" };

const ALLOWED_ICONS = new Set([
  "home",
  "travel",
  "properties",
  "staff",
  "events",
  "finance",
  "legal",
  "personal",
  "vendors",
  "health",
  "wallet",
  "scales",
  "tag",
  "heart",
  "chart",
  "plane",
  "person",
]);

export type ExistingSection = { id: string; name: string };
export type ExistingOrg = {
  id: string;
  name: string;
  area: "personal" | "work";
  sections: ExistingSection[];
};

function structureForPrompt(orgs: ExistingOrg[]): string {
  return orgs
    .map((o) => {
      const secs = o.sections.length
        ? o.sections.map((s) => `    - section id=${s.id} name="${s.name}"`).join("\n")
        : "    (no custom sections)";
      return `- org id=${o.id} name="${o.name}" area=${o.area}\n${secs}`;
    })
    .join("\n");
}

/**
 * Generate a reshape PATCH (creates, section adds, renames, soft-deletes) from
 * the user's request against their existing structure. The model may only
 * reference real ids; anything it returns referencing an unknown id is dropped.
 * Conservative: returns an empty patch when nothing is clearly actionable.
 */
export async function generateReshapePatch(
  intent: string,
  orgs: ExistingOrg[],
  locale = "en",
): Promise<PlanPatch> {
  const language = LANG[locale] ?? "English";
  const orgIds = new Set(orgs.map((o) => o.id));
  const sectionIds = new Set(orgs.flatMap((o) => o.sections.map((s) => s.id)));

  const system = `The user already has Oria set up and wants to change it. From their request and their current structure, output a PATCH describing what to CREATE, RENAME, or DELETE.

Rules:
- Write all user-facing strings (names, section titles) in ${language}, in the user's own words.
- To DELETE a space or section, reference its exact id from the structure. To RENAME, reference the exact id plus its current name (from) and the new name (to).
- A new role or job is a new work org (kind "office"). A shared life area is a circle.
- Add sections into an existing org via section_adds with that org's id.
- Section icons MUST be one of: home, travel, properties, staff, events, finance, legal, personal, vendors, health, wallet, scales, tag, heart, chart, plane, person.
- Be conservative. If the target is ambiguous or you are unsure, leave it out (return an empty patch rather than guess). Never invent ids.
- Never use the em-dash character (Unicode U+2014). Use a comma, a period, or a rewrite.

Return JSON ONLY:
{
  "creates": [{"name":"...","kind":"office"|"circle","description":"...","accent_color":"#rrggbb","template_id":"custom","sections":[{"key":"snake","title":"...","icon":"...","priority":0}],"ask_oria_starters":[]}],
  "section_adds": [{"orgId":"<real org id>","section":{"key":"snake","title":"...","icon":"...","priority":0}}],
  "renames": [{"kind":"org"|"section","id":"<real id>","from":"current name","to":"new name"}],
  "deletes": [{"kind":"org"|"section","id":"<real id>","name":"the name"}]
}`;

  const user = `Current structure:\n${structureForPrompt(orgs)}\n\nThe user said: "${intent}"\n\nReturn the patch as JSON.`;

  try {
    const res = await infraComplete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { tier: "premium", maxTokens: 1600 },
    );
    const raw = res?.content.trim() || "{}";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Partial<PlanPatch>;
    return sanitizePatch(parsed, orgIds, sectionIds);
  } catch {
    return EMPTY_PATCH;
  }
}

function sanitizeSection(s: unknown): PlanSection | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  if (typeof o.title !== "string" || !o.title.trim()) return null;
  const icon = typeof o.icon === "string" && ALLOWED_ICONS.has(o.icon) ? o.icon : "tag";
  return {
    key:
      typeof o.key === "string"
        ? o.key
        : o.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .slice(0, 40),
    title: o.title.slice(0, 60),
    icon,
    priority: typeof o.priority === "number" ? o.priority : 0,
  };
}

// Exported for unit tests: this is the safety gate for delete/rename paths,
// dropping any patch op whose target id is not a known org/section.
export function sanitizePatch(
  p: Partial<PlanPatch>,
  orgIds: Set<string>,
  sectionIds: Set<string>,
): PlanPatch {
  const creates: WorkspacePlan[] = Array.isArray(p.creates)
    ? (p.creates
        .map((c) => {
          const o = c as Record<string, unknown>;
          if (typeof o.name !== "string" || !o.name.trim()) return null;
          const sections = Array.isArray(o.sections)
            ? (o.sections.map(sanitizeSection).filter(Boolean) as PlanSection[])
            : [];
          return {
            name: o.name.slice(0, 60),
            kind: o.kind === "circle" ? "circle" : "office",
            description: typeof o.description === "string" ? o.description : "",
            accent_color: typeof o.accent_color === "string" ? o.accent_color : null,
            sections,
            ask_oria_starters: Array.isArray(o.ask_oria_starters)
              ? o.ask_oria_starters.filter((x): x is string => typeof x === "string")
              : [],
            template_id: "custom",
          } as WorkspacePlan;
        })
        .filter(Boolean) as WorkspacePlan[])
    : [];

  const section_adds = Array.isArray(p.section_adds)
    ? (p.section_adds
        .map((a) => {
          const o = a as Record<string, unknown>;
          const section = sanitizeSection(o.section);
          if (typeof o.orgId !== "string" || !orgIds.has(o.orgId) || !section) return null;
          return { orgId: o.orgId, section };
        })
        .filter(Boolean) as PlanPatch["section_adds"])
    : [];

  const renames = Array.isArray(p.renames)
    ? (p.renames
        .map((r) => {
          const o = r as Record<string, unknown>;
          const kind = o.kind === "section" ? "section" : "org";
          const set = kind === "org" ? orgIds : sectionIds;
          if (
            typeof o.id !== "string" ||
            !set.has(o.id) ||
            typeof o.to !== "string" ||
            !o.to.trim()
          )
            return null;
          return {
            kind,
            id: o.id,
            from: typeof o.from === "string" ? o.from : "",
            to: o.to.slice(0, 60),
          };
        })
        .filter(Boolean) as PlanPatch["renames"])
    : [];

  const deletes = Array.isArray(p.deletes)
    ? (p.deletes
        .map((d) => {
          const o = d as Record<string, unknown>;
          const kind = o.kind === "section" ? "section" : "org";
          const set = kind === "org" ? orgIds : sectionIds;
          if (typeof o.id !== "string" || !set.has(o.id)) return null;
          return { kind, id: o.id, name: typeof o.name === "string" ? o.name : "" };
        })
        .filter(Boolean) as PlanPatch["deletes"])
    : [];

  return { creates, section_adds, renames, deletes };
}
