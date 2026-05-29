import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

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
      { name: "Bills",    icon: "wallet",  sort_order: 0 },
      { name: "Health",   icon: "health",  sort_order: 10 },
      { name: "Travel",   icon: "travel",  sort_order: 20 },
      { name: "Personal", icon: "person",  sort_order: 30 },
      { name: "Diet",     icon: "heart",   sort_order: 40 },
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
 * Apply a template to an existing organization: create the seeded custom
 * sections and set template_key on the org row. Idempotent: if the org
 * already has a template_key, this is a no-op.
 */
export async function applyTemplate(
  organizationId: string,
  templateKey: TemplateKey,
): Promise<void> {
  const admin = createAdminClient();

  // Idempotency guard.
  const { data: org } = await admin
    .from("organizations")
    .select("id, template_key")
    .eq("id", organizationId)
    .maybeSingle();
  if (!org) return;
  if ((org as { template_key?: string | null }).template_key) return;

  const template = WORKSPACE_TEMPLATES.find((t) => t.key === templateKey);
  if (!template) return;

  // Create seeded custom sections one-by-one so the unique(org_id,name)
  // constraint doesn't abort the whole batch if one already exists.
  for (const s of template.section_seeds) {
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

  // Seed entity types for this template.
  const entitySeeds = TEMPLATE_ENTITY_TYPES[templateKey] ?? [];
  for (const et of entitySeeds) {
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

  // Stamp the template key.
  await admin
    .from("organizations")
    .update({ template_key: templateKey })
    .eq("id", organizationId);

  revalidatePath("/dashboard", "layout");
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
    { key: "vehicle",  label_singular: "Vehicle",  label_plural: "Vehicles",  icon: "travel",   field_schema: VEHICLE_FIELDS },
    { key: "property", label_singular: "Property", label_plural: "Properties",icon: "home",     field_schema: PROPERTY_FIELDS },
    { key: "person",   label_singular: "Person",   label_plural: "People",    icon: "person",   field_schema: PERSON_FIELDS },
  ],
  investor: [
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
