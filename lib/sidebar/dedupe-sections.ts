/**
 * Sidebar section de-duplication.
 *
 * A name must appear once in the rail. The personal template seeds custom
 * sections literally named "Bills", "Health", "Travel", "Personal", which
 * shadow the smart Bills aggregation page and the built-in Health/Travel/
 * Personal sections, so the same name renders twice. These seeded duplicates
 * carry no data; the canonical entry is the real destination.
 *
 * RULE (documented in CLAUDE.md): a section name renders once, resolved
 * case-insensitively. When entries share a name, the canonical one wins by
 * precedence smart > builtin > review > custom (a curated/aggregation page or a
 * built-in section beats a same-named user/seeded custom section). Order is
 * otherwise preserved. General by name, never hardcoded to specific sections.
 */

const RANK: Record<string, number> = {
  smart: 0,
  builtin: 1,
  review: 2,
  custom: 3,
};
function rankOf(kind: string): number {
  return RANK[kind] ?? 4;
}

export function dedupeSidebarSections<T extends { label: string; kind: string }>(items: T[]): T[] {
  // For each lowercased name keep the index of the highest-precedence entry
  // (ties resolve to the earliest), then filter to those indices so the
  // surviving entries stay in their original order.
  const bestIndex = new Map<string, number>();
  items.forEach((it, i) => {
    const key = it.label.trim().toLowerCase();
    const cur = bestIndex.get(key);
    if (cur === undefined || rankOf(it.kind) < rankOf(items[cur].kind)) {
      bestIndex.set(key, i);
    }
  });
  const keep = new Set(bestIndex.values());
  return items.filter((_, i) => keep.has(i));
}
