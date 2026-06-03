// Resolves the display label for the "Things" area (entity types page + nav).
//
//   custom_label (organizations.things_label)
//     ?? "Assets" for the asset-heavy investor space
//     ?? "Things"
//
// Template-agnostic since Round 13: the abstract category keys were retired, so
// only the preserved 'investor' template still implies an asset-heavy label.
// Pure and dependency-free so the resolver can be unit-tested and shared by
// the sidebar, the Things page, and metadata.

export function resolveThingsLabel(org: {
  things_label?: string | null;
  template_key?: string | null;
}): string {
  const custom = org.things_label?.trim();
  if (custom) return custom;

  return org.template_key === "investor" ? "Assets" : "Things";
}
