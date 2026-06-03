import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { trackEvent } from "@/lib/analytics";

export type TemplateKey =
  | "personal"
  | "investor"
  | "business"
  | "family_office"
  | "custom";

export type SectionSeed = {
  name: string;
  icon: string;
  sort_order: number;
};

export type WorkspaceTemplate = {
  key: TemplateKey;
  label: string;
  description: string;
  icon: string;
  section_seeds: SectionSeed[];
  delegation_prominent: boolean;
};

export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    key: "personal",
    label: "Personal",
    description: "Home, family, and individual life.",
    icon: "home",
    delegation_prominent: false,
    section_seeds: [
      // Diet folded into Health (Round 14 F3): no standalone Diet seed; the
      // Diet meal tracker is a sub-area of Health.
      { name: "Bills",    icon: "wallet",  sort_order: 0 },
      { name: "Health",   icon: "health",  sort_order: 10 },
      { name: "Travel",   icon: "travel",  sort_order: 20 },
      { name: "Personal", icon: "person",  sort_order: 30 },
    ],
  },
  {
    key: "investor",
    label: "Investor / Portfolio",
    description: "LP positions, funds, deals, and due diligence.",
    icon: "chart",
    delegation_prominent: true,
    section_seeds: [
      { name: "Funds",     icon: "wallet", sort_order: 0 },
      { name: "Deals",     icon: "scales", sort_order: 10 },
      { name: "Diligence", icon: "search", sort_order: 20 },
      { name: "Reports",   icon: "chart",  sort_order: 30 },
    ],
  },
  {
    key: "business",
    label: "Business / Office",
    description: "Operations, contracts, employees, and expenses.",
    icon: "staff",
    delegation_prominent: true,
    section_seeds: [
      { name: "Expenses",   icon: "wallet", sort_order: 0 },
      { name: "Contracts",  icon: "scales", sort_order: 10 },
      { name: "Vendors",    icon: "tag",    sort_order: 20 },
      { name: "Compliance", icon: "lock",   sort_order: 30 },
      { name: "Employees",  icon: "staff",  sort_order: 40 },
    ],
  },
  {
    key: "family_office",
    label: "Family Office",
    description: "Properties, investments, insurance, and multi-entity management.",
    icon: "properties",
    delegation_prominent: true,
    section_seeds: [
      { name: "Properties",  icon: "home",    sort_order: 0 },
      { name: "Investments", icon: "chart",   sort_order: 10 },
      { name: "Insurance",   icon: "wallet",  sort_order: 20 },
      { name: "Tax",         icon: "scales",  sort_order: 30 },
      { name: "Travel",      icon: "travel",  sort_order: 40 },
    ],
  },
  {
    key: "custom",
    label: "Custom / Skip",
    description: "Start blank and add sections as you go.",
    icon: "plus",
    delegation_prominent: false,
    section_seeds: [],
  },
];

/**
 * Result of a (multi-)template apply. `delegation_prominent` is the OR of
 * every applied template's flag. it's not persisted on the org row (no
 * column for it today), so callers that care about that bit at apply time
 * can read it from this return value.
 */
export type ApplyTemplatesResult = {
  /** Template key that was stamped on the org row. `custom` if the user
   *  picked multiple templates or skipped. */
  storedKey: TemplateKey;
  /** OR-merged across every applied template. */
  delegationProminent: boolean;
  /** Number of section seeds attempted (post-dedup). */
  sectionCount: number;
  /** Number of entity-type seeds attempted (post-dedup). */
  entityTypeCount: number;
};

/**
 * Pure merge of N template selections into the seed lists we'll apply.
 *
 * Rules (see Feature 4 spec):
 *  • Sections de-duped by case-insensitive name; first occurrence wins so
 *    the order of the user's selection drives the section order.
 *  • Entity types de-duped by `key`; first occurrence wins.
 *  • Unknown / `custom` template keys contribute nothing.
 *  • `delegationProminent` is the OR of the selected templates.
 *
 * Exported for unit testing without touching the DB.
 */
export function mergeTemplatesForApply(
  templateKeys: TemplateKey[],
): {
  sections: SectionSeed[];
  entityTypes: EntityTypeSeed[];
  delegationProminent: boolean;
} {
  const seenSection = new Set<string>();
  const sections: SectionSeed[] = [];
  const seenEntity = new Set<string>();
  const entityTypes: EntityTypeSeed[] = [];
  let delegationProminent = false;

  for (const key of templateKeys) {
    const template = WORKSPACE_TEMPLATES.find((t) => t.key === key);
    if (!template) continue;
    if (template.delegation_prominent) delegationProminent = true;

    for (const s of template.section_seeds) {
      const lookup = s.name.trim().toLowerCase();
      if (seenSection.has(lookup)) continue;
      seenSection.add(lookup);
      sections.push(s);
    }

    const entitySeeds = TEMPLATE_ENTITY_TYPES[key] ?? [];
    for (const et of entitySeeds) {
      if (seenEntity.has(et.key)) continue;
      seenEntity.add(et.key);
      entityTypes.push(et);
    }
  }

  return { sections, entityTypes, delegationProminent };
}

// The abstract category keys retired in Round 13 (migration 0065). They remain
// valid INTERNAL seed-set identifiers here, but must never be stamped onto
// organizations.template_key, whose constraint no longer allows them. Selecting
// one still seeds its sections/entity types; the stored key collapses to custom.
const RETIRED_STORED_KEYS: ReadonlySet<TemplateKey> = new Set([
  "personal",
  "business",
  "family_office",
]);

/** A value allowed in organizations.template_key for an in-app work space. */
type StoredTemplateKey = "investor" | "custom";

/**
 * Decide which template key to stamp on the org row. Single selection of a
 * still-stored template ('investor') stamps that key; everything else (a
 * retired abstract seed, multi-selection, skip, or custom) collapses to
 * `custom`. Seeding is unaffected. only the persisted vocabulary is narrowed.
 */
export function resolveStoredTemplateKey(
  templateKeys: TemplateKey[],
): StoredTemplateKey {
  const real = templateKeys.filter((k) => k !== "custom");
  // A single non-retired pick ('investor') is stamped; anything else (a lone
  // retired seed, multiple picks, or skip) collapses to custom.
  if (real.length === 1 && !RETIRED_STORED_KEYS.has(real[0])) {
    return real[0] as StoredTemplateKey;
  }
  return "custom";
}

/**
 * Apply one or more templates to an existing organization. Creates the
 * merged set of custom sections and entity types and stamps
 * `template_key` on the org row. Idempotent: if the org already has a
 * non-null template_key, this is a no-op.
 */
export async function applyTemplates(
  organizationId: string,
  templateKeys: TemplateKey[],
): Promise<ApplyTemplatesResult | null> {
  const admin = createAdminClient();

  // Idempotency guard.
  const { data: org } = await admin
    .from("organizations")
    .select("id, template_key")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return null;
  if ((org as { template_key?: string | null }).template_key) return null;

  const { sections, entityTypes, delegationProminent } =
    mergeTemplatesForApply(templateKeys);
  const storedKey = resolveStoredTemplateKey(templateKeys);

  // Create seeded custom sections one-by-one so the unique(org_id,name)
  // constraint doesn't abort the whole batch if one already exists.
  for (const s of sections) {
    await admin
      .from("custom_sections")
      .insert({
        organization_id: organizationId,
        name: s.name,
        icon: s.icon,
        created_by: null,
      })
      .select()
      .maybeSingle();
  }

  // Seed merged entity types.
  for (const et of entityTypes) {
    await admin
      .from("entity_types")
      .upsert(
        {
          organization_id: organizationId,
          key: et.key,
          label_singular: et.label_singular,
          label_plural: et.label_plural,
          icon: et.icon ?? null,
          field_schema: et.field_schema,
          is_seeded: true,
          created_by: null,
        },
        { onConflict: "organization_id,key" },
      );
  }

  // Personal spaces should not surface the estate-oriented builtin
  // "Properties" section by default. Hide it at apply time (recoverable any
  // time from Settings -> Sections). Existing Personal spaces are handled by
  // the one-time backfill in migration 0044. Keyed on the selection (the stored
  // key now collapses retired abstract keys to custom).
  if (templateKeys.includes("personal")) {
    // Fresh org (applyTemplate runs once, before any section_settings exist),
    // so a plain insert is safe. The unique index here is partial, so we avoid
    // ON CONFLICT and just guard against a pre-existing row.
    const { data: existingSetting } = await admin
      .from("section_settings")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("builtin_section", "properties")
      .maybeSingle();
    if (!existingSetting) {
      await admin.from("section_settings").insert({
        organization_id: organizationId,
        builtin_section: "properties",
        hidden: true,
        sort_order: 20,
      });
    }
  }

  await admin
    .from("organizations")
    .update({ template_key: storedKey })
    .eq("id", organizationId);

  trackEvent("workspace_template_selected", { template: storedKey });
  revalidatePath("/dashboard", "layout");

  return {
    storedKey,
    delegationProminent,
    sectionCount: sections.length,
    entityTypeCount: entityTypes.length,
  };
}

/**
 * Single-template apply. kept as a thin wrapper around applyTemplates()
 * so existing callers (lib/data/mode-actions.ts) keep working without
 * change. New call sites should prefer applyTemplates().
 */
export async function applyTemplate(
  organizationId: string,
  templateKey: TemplateKey,
): Promise<void> {
  await applyTemplates(organizationId, [templateKey]);
}

// ── Entity type seeds per template ───────────────────────────────────────────

type EntityTypeSeed = {
  key: string;
  label_singular: string;
  label_plural: string;
  icon?: string;
  field_schema: Array<{ key: string; label: string; type: string; required?: boolean; options?: string[] }>;
};

const VEHICLE_FIELDS: EntityTypeSeed["field_schema"] = [
  { key: "make",           label: "Make",          type: "text" },
  { key: "model",          label: "Model",         type: "text" },
  { key: "year",           label: "Year",          type: "number" },
  { key: "vin",            label: "VIN",           type: "text" },
  { key: "license_plate",  label: "License plate", type: "text" },
  { key: "color",          label: "Color",         type: "text" },
  { key: "purchase_date",  label: "Purchase date", type: "date" },
  { key: "purchase_price", label: "Purchase price",type: "currency" },
];

const PROPERTY_FIELDS: EntityTypeSeed["field_schema"] = [
  { key: "address",         label: "Address",       type: "text", required: true },
  { key: "beds",            label: "Beds",          type: "number" },
  { key: "baths",           label: "Baths",         type: "number" },
  { key: "square_feet",     label: "Square feet",   type: "number" },
  { key: "year_built",      label: "Year built",    type: "number" },
  { key: "purchase_date",   label: "Purchase date", type: "date" },
  { key: "purchase_price",  label: "Purchase price",type: "currency" },
];

const PERSON_FIELDS: EntityTypeSeed["field_schema"] = [
  { key: "relationship", label: "Relationship", type: "text" },
  { key: "email",        label: "Email",        type: "text" },
  { key: "phone",        label: "Phone",        type: "text" },
  { key: "birthday",     label: "Birthday",     type: "date" },
  { key: "notes",        label: "Notes",        type: "long_text" },
];

const TEMPLATE_ENTITY_TYPES: Record<TemplateKey, EntityTypeSeed[]> = {
  personal: [
    // Property is intentionally NOT seeded for Personal. It is an estate /
    // landlord concept that belongs to the asset-heavy templates (Investor,
    // Business, Family Office). Personal stays light.
    { key: "vehicle",  label_singular: "Vehicle",  label_plural: "Vehicles",  icon: "travel",   field_schema: VEHICLE_FIELDS },
    { key: "person",   label_singular: "Person",   label_plural: "People",    icon: "person",   field_schema: PERSON_FIELDS },
  ],
  investor: [
    { key: "property", label_singular: "Property", label_plural: "Properties", icon: "home", field_schema: PROPERTY_FIELDS },
    { key: "fund",              label_singular: "Fund",              label_plural: "Funds",              icon: "wallet",
      field_schema: [
        { key: "manager",       label: "Manager",       type: "text" },
        { key: "vintage",       label: "Vintage year",  type: "number" },
        { key: "commitment",    label: "Commitment",    type: "currency" },
        { key: "strategy",      label: "Strategy",      type: "text" },
      ]},
    { key: "deal",              label_singular: "Deal",              label_plural: "Deals",              icon: "scales",
      field_schema: [
        { key: "company",       label: "Company",       type: "text", required: true },
        { key: "stage",         label: "Stage",         type: "enum",
          options: ["Pre-seed", "Seed", "Series A", "Series B", "Growth", "Other"] },
        { key: "amount",        label: "Amount",        type: "currency" },
        { key: "close_date",    label: "Close date",    type: "date" },
      ]},
    { key: "portfolio_company", label_singular: "Portfolio Company", label_plural: "Portfolio Companies", icon: "chart",
      field_schema: [
        { key: "name",          label: "Company",       type: "text", required: true },
        { key: "sector",        label: "Sector",        type: "text" },
        { key: "ownership_pct", label: "Ownership %",   type: "number" },
        { key: "valuation",     label: "Last valuation",type: "currency" },
      ]},
  ],
  business: [
    { key: "vendor",   label_singular: "Vendor",   label_plural: "Vendors",  icon: "tag",
      field_schema: [
        { key: "contact_name",  label: "Contact",     type: "text" },
        { key: "email",         label: "Email",       type: "text" },
        { key: "phone",         label: "Phone",       type: "text" },
        { key: "service",       label: "Service",     type: "text" },
        { key: "contract_end",  label: "Contract end",type: "date" },
      ]},
    { key: "project",  label_singular: "Project",  label_plural: "Projects", icon: "chart",
      field_schema: [
        { key: "client",        label: "Client",      type: "text" },
        { key: "status",        label: "Status",      type: "enum",
          options: ["Planning", "Active", "On hold", "Complete"] },
        { key: "start_date",    label: "Start",       type: "date" },
        { key: "end_date",      label: "End",         type: "date" },
        { key: "budget",        label: "Budget",      type: "currency" },
      ]},
    { key: "property", label_singular: "Property", label_plural: "Properties",icon: "home", field_schema: PROPERTY_FIELDS },
    { key: "employee", label_singular: "Employee", label_plural: "Employees", icon: "staff",
      field_schema: [
        { key: "title",         label: "Job title",   type: "text" },
        { key: "department",    label: "Department",  type: "text" },
        { key: "start_date",    label: "Start date",  type: "date" },
        { key: "email",         label: "Email",       type: "text" },
      ]},
  ],
  family_office: [
    { key: "property",   label_singular: "Property",   label_plural: "Properties",  icon: "home",       field_schema: PROPERTY_FIELDS },
    { key: "investment", label_singular: "Investment", label_plural: "Investments", icon: "chart",
      field_schema: [
        { key: "institution",   label: "Institution",  type: "text" },
        { key: "account",       label: "Account #",    type: "text" },
        { key: "asset_class",   label: "Asset class",  type: "enum",
          options: ["Equity", "Fixed income", "Real estate", "Private equity", "Cash", "Other"] },
        { key: "value",         label: "Current value",type: "currency" },
        { key: "as_of",         label: "As of",        type: "date" },
      ]},
    { key: "vehicle",    label_singular: "Vehicle",    label_plural: "Vehicles",    icon: "travel",    field_schema: VEHICLE_FIELDS },
    { key: "collection", label_singular: "Collection item", label_plural: "Collection", icon: "gift",
      field_schema: [
        { key: "category",      label: "Category",     type: "enum",
          options: ["Art", "Jewelry", "Wine", "Watch", "Other"] },
        { key: "artist_maker",  label: "Artist / Maker",type: "text" },
        { key: "year",          label: "Year",          type: "number" },
        { key: "appraised_value",label:"Appraised value",type: "currency" },
        { key: "appraisal_date",label: "Appraisal date",type: "date" },
      ]},
    { key: "person",     label_singular: "Person",     label_plural: "People",      icon: "person",    field_schema: PERSON_FIELDS },
  ],
  custom: [],
};
