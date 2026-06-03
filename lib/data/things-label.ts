// Resolves the display label for the Records area (entity types page + nav):
// the people, vehicles, and properties Oria keeps.
//
//   custom_label (organizations.things_label)
//     ?? "Assets" for the asset-heavy investor space
//     ?? "Records"
//
// Template-agnostic since Round 13: the abstract category keys were retired, so
// only the preserved 'investor' template still implies an asset-heavy label.
// Pure and dependency-free so the resolver can be unit-tested and shared by
// the sidebar, the Records page, and metadata.
//
// The DB column (organizations.things_label), the resolver name, and the
// /dashboard/things route keep their internal "things" naming; only the
// user-facing default label changed. "Records" (not "Trackables") because the
// canonical "Trackables" noun belongs to the separate renewals feature at
// /dashboard/trackables; "item/entity/thing" are banned (terminology lock).

export function resolveThingsLabel(org: {
  things_label?: string | null;
  template_key?: string | null;
}): string {
  const custom = org.things_label?.trim();
  if (custom) return custom;

  // Default label is "Records" (Round 14: Things -> Items -> Records). The
  // asset-heavy investor template keeps "Assets" (a context label).
  return org.template_key === "investor" ? "Assets" : "Records";
}
