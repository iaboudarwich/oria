import { describe, it, expect, vi } from "vitest";

// Regression guard for cross-space section leakage: "Manage Sections" in Work
// was showing Personal sections. Every section query must filter by the
// active organization_id. This test seeds two orgs with an identically-named
// custom section and asserts listAllSections only ever returns the active
// org's rows. If the org filter were dropped, both rows would come back and
// these assertions would fail.

const ORG_A = "org-a";
const ORG_B = "org-b";

const CUSTOM_ROWS = [
  { id: "cs-a", organization_id: ORG_A, name: "Projects", icon: null, created_at: "2026-01-01" },
  { id: "cs-b", organization_id: ORG_B, name: "Projects", icon: null, created_at: "2026-01-01" },
];
const SETTINGS_ROWS = [
  {
    id: "ss-a",
    organization_id: ORG_A,
    builtin_section: null,
    custom_section_id: "cs-a",
    sort_order: 5,
    hidden: false,
    custom_label: null,
  },
  {
    id: "ss-b",
    organization_id: ORG_B,
    builtin_section: null,
    custom_section_id: "cs-b",
    sort_order: 5,
    hidden: false,
    custom_label: null,
  },
];

let currentOrg = ORG_A;

vi.mock("@/lib/data/organizations", () => ({
  requireContext: async () => ({ organization: { id: currentOrg } }),
}));

function rowsFor(table: string) {
  if (table === "custom_sections") return CUSTOM_ROWS;
  if (table === "section_settings") return SETTINGS_ROWS;
  return [];
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      let orgFilter: string | null = null;
      let liveOnly = false;
      const builder = {
        select: () => builder,
        order: () => builder,
        eq: (col: string, val: string) => {
          if (col === "organization_id") orgFilter = val;
          return builder;
        },
        is: (col: string, val: unknown) => {
          if (col === "deleted_at" && val === null) liveOnly = true;
          return builder;
        },
        // Thenable so `await query` resolves to { data }.
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
          const data = rowsFor(table).filter(
            (r) =>
              (orgFilter === null || r.organization_id === orgFilter) &&
              (!liveOnly || (r as { deleted_at?: string | null }).deleted_at == null),
          );
          resolve({ data, error: null });
        },
      };
      return builder;
    },
  }),
}));

import { listAllSections } from "@/lib/data/all-sections";

describe("section scoping by organization", () => {
  it("returns only org A's custom section when A is active", async () => {
    currentOrg = ORG_A;
    const sections = await listAllSections({ includeReview: false });
    const custom = sections.filter((s) => s.ref.kind === "custom");
    expect(custom).toHaveLength(1);
    expect(custom[0].ref.key).toBe("cs-a");
  });

  it("returns only org B's custom section when B is active (no leak)", async () => {
    currentOrg = ORG_B;
    const sections = await listAllSections({ includeReview: false });
    const custom = sections.filter((s) => s.ref.kind === "custom");
    expect(custom).toHaveLength(1);
    expect(custom[0].ref.key).toBe("cs-b");
  });
});
