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

  // Stamp the template key.
  await admin
    .from("organizations")
    .update({ template_key: templateKey })
    .eq("id", organizationId);

  revalidatePath("/dashboard", "layout");
}
