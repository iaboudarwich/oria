/**
 * Settings "editing scope" helpers. Pure, unit-tested.
 *
 * Settings has a local editing scope (which space you are adjusting) that is
 * independent of the app's active space: changing it re-scopes the panels in
 * place via the `?scope=` URL param, and never touches the `oria_active_org`
 * cookie, so leaving Settings does not change which space the rest of the app
 * is in.
 */

export type ScopeKind = "personal" | "work" | "circle";

/** Map an org's kind to the three user-facing scope kinds. */
export function scopeKindOf(org: { kind?: string | null }): ScopeKind {
  if (org.kind === "office") return "work";
  if (org.kind === "circle") return "circle";
  return "personal";
}

/** Plain-language label for one scope, e.g. "Personal", "Work - Acme". Takes a
 *  next-intl `t` for the "settingsScope" namespace so it works server or client. */
export function scopeLabel(
  t: (key: string, vars?: Record<string, string>) => string,
  kind: ScopeKind,
  name: string,
): string {
  if (kind === "personal") return t("personal");
  if (kind === "work") return t("work", { name });
  return t("circle", { name });
}

/**
 * Pick the org being edited from the `?scope=` param, validated against the
 * spaces the user actually belongs to. Falls back to the active org so an
 * absent or stale param is always safe.
 */
export function resolveEditingScopeId(
  scopeParam: string | null | undefined,
  memberOrgIds: string[],
  activeOrgId: string | null,
): string | null {
  if (scopeParam && memberOrgIds.includes(scopeParam)) return scopeParam;
  if (activeOrgId && memberOrgIds.includes(activeOrgId)) return activeOrgId;
  return activeOrgId ?? memberOrgIds[0] ?? null;
}
