// Resolves the display label for the "Things" area (entity types page + nav).
//
//   custom_label (organizations.things_label)
//     ?? template default ("Assets" for asset-heavy templates)
//     ?? "Things"
//
// Pure and dependency-free so the resolver can be unit-tested and shared by
// the sidebar, the Things page, and metadata.

export function resolveThingsLabel(org: {
  things_label?: string | null;
  template_key?: string | null;
}): string {
  const custom = org.things_label?.trim();
  if (custom) return custom;

  switch (org.template_key) {
    case "investor":
    case "business":
    case "family_office":
      return "Assets";
    default:
      return "Things";
  }
}
