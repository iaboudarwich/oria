// Resolves the display label for the trackables area (entity types page + nav).
//
//   custom_label (organizations.things_label)
//     ?? "Assets" for the asset-heavy investor space
//     ?? "Trackables"
//
// Template-agnostic since Round 13: the abstract category keys were retired, so
// only the preserved 'investor' template still implies an asset-heavy label.
// Pure and dependency-free so the resolver can be unit-tested and shared by
// the sidebar, the trackables page, and metadata.
//
// The DB column (organizations.things_label), the resolver name, and the
// /dashboard/things route keep their internal "things" naming; only the
// user-facing default label is canonical "Trackables" (terminology lock).

export function resolveThingsLabel(org: {
  things_label?: string | null;
  template_key?: string | null;
}): string {
  const custom = org.things_label?.trim();
  if (custom) return custom;

  // Default label is the canonical "Trackables" (terminology lock, Round 14:
  // Things -> Items -> Trackables). The asset-heavy investor template keeps
  // "Assets" (a context label, not the generic domain noun).
  return org.template_key === "investor" ? "Assets" : "Trackables";
}
