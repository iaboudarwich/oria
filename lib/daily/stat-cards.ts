import type { ContextArchetype } from "@/lib/daily/context-surface";

/**
 * Today daily-stats tailoring. The home shows a per-archetype set of stat
 * cards, defaulted from the 14.9 resolver, narrowed to only what the user
 * actually has connected, then re-ordered / shown / hidden by the user (the
 * pref merge is here; persistence rides user_preferences.dashboard_cards).
 *
 * Pure + tested so the tailoring can never drift from the UI.
 */

export type StatCardKey = "context" | "agenda" | "health" | "net_worth" | "spend" | "subscriptions";

export const ALL_STAT_CARDS: StatCardKey[] = [
  "context",
  "agenda",
  "health",
  "net_worth",
  "spend",
  "subscriptions",
];

/** What the user has, so a card only shows when it has data behind it. */
export type CardSignals = {
  archetype: ContextArchetype;
  hasHealth: boolean;
  hasRituals: boolean;
  hasFinance: boolean;
  hasBills: boolean;
};

// Default ordering per archetype. context + agenda anchor the top; money-led
// archetypes raise net worth + spend, personal raises health.
const ORDER: Record<ContextArchetype, StatCardKey[]> = {
  personal: ["context", "agenda", "health", "net_worth", "spend", "subscriptions"],
  investor: ["context", "net_worth", "spend", "agenda", "subscriptions", "health"],
  business: ["context", "spend", "net_worth", "agenda", "subscriptions", "health"],
  family_office: ["context", "net_worth", "agenda", "spend", "subscriptions", "health"],
};

function applies(key: StatCardKey, s: CardSignals): boolean {
  switch (key) {
    case "context":
    case "agenda":
      return true;
    case "health":
      return s.hasHealth || s.hasRituals;
    case "net_worth":
      return s.hasFinance;
    case "spend":
    case "subscriptions":
      return s.hasBills;
  }
}

/** The default ordered card set for a user: their archetype order, filtered to
 *  the cards that actually have data. */
export function defaultStatCards(s: CardSignals): StatCardKey[] {
  return ORDER[s.archetype].filter((k) => applies(k, s));
}

export type CardPref = { key: StatCardKey; hidden: boolean };

/**
 * Merge the user's saved prefs with the currently-available cards:
 * - keep the user's order for cards they have a pref for and that still apply,
 * - drop prefs for cards that no longer apply (nothing connected),
 * - append newly-available cards (no pref yet) at the end, visible.
 * The result is the exact ordered list the home renders (hidden flag respected
 * by the UI, but the card stays in the manager so it can be re-shown).
 */
export function resolveStatCards(available: StatCardKey[], prefs: CardPref[]): CardPref[] {
  const avail = new Set(available);
  const seen = new Set<StatCardKey>();
  const out: CardPref[] = [];
  for (const p of prefs) {
    if (!avail.has(p.key) || seen.has(p.key)) continue;
    seen.add(p.key);
    out.push({ key: p.key, hidden: p.hidden === true });
  }
  for (const key of available) {
    if (!seen.has(key)) out.push({ key, hidden: false });
  }
  return out;
}

/** Parse a stored prefs blob into a clean CardPref[] (ignores junk keys). */
export function parseCardPrefs(raw: unknown): CardPref[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set(ALL_STAT_CARDS);
  const out: CardPref[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const key = (r as { key?: unknown })?.key;
    if (typeof key !== "string" || !valid.has(key as StatCardKey) || seen.has(key)) continue;
    seen.add(key);
    out.push({ key: key as StatCardKey, hidden: (r as { hidden?: unknown }).hidden === true });
  }
  return out;
}
