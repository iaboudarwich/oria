#!/usr/bin/env node
/**
 * Banned-phrase lint guard for user-facing i18n copy.
 *
 * Wired into `npm run lint` (after eslint). Fails the build on:
 *   (a) any em-dash (U+2014) in a message value, in any locale;
 *   (b) the banned domain-noun synonyms in a message value, per locale; and
 *   (c) opaque technical jargon (CLAUDE.md principle 19): a planted MFA / AAL2 /
 *       OAuth / token / null / ... fails the build like an em-dash, so raw
 *       provider jargon never reaches user-facing copy. See JARGON_TERMS for the
 *       list and the reasoning on what is deliberately left out.
 *
 * The canonical noun is "trackable" (terminology lock). The synonyms
 * item / entity / thing (and their per-locale equivalents) are banned so a
 * regression that reintroduces them fails CI instead of shipping.
 *
 * Scope is the i18n message files (messages/{en,ar,fr,es}.json), which are the
 * canonical store for every user-facing string. Code comments and incidental
 * source strings are out of scope (em-dashes there never reach a user, and a
 * blanket source ban would flag legitimate regex character classes and prose
 * comments). The matching is deliberately conservative: only domain-noun
 * synonyms with zero legitimate use in the corpus are banned. Generic words
 * that double as the domain noun in some languages (fr "chose" in "quelque
 * chose", es "cosa" in "cualquier cosa", ar "شيء" in "أي شيء") are NOT banned,
 * because they have legitimate non-domain uses; those were renamed by hand.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const EM_DASH = "—";

export const LOCALES = ["en", "ar", "fr", "es"];

// Per-locale banned domain-noun synonyms (canonical noun: "trackable").
// English terms are checked in every locale (English leakage is always wrong).
export const BANNED_TERMS = {
  en: ["item", "items", "entity", "entities", "thing", "things"],
  fr: ["élément", "éléments", "entité", "entités", "objet", "objets"],
  es: ["elemento", "elementos", "entidad", "entidades"],
  ar: ["عنصر", "عناصر", "كيان", "كيانات", "أشياء"],
};

// Plain-language guard (CLAUDE.md principle 19). Opaque technical jargon and
// raw provider-error identifiers must never reach user-facing copy: a planted
// one fails the build like an em-dash. These terms have ZERO legitimate use in
// the product's everyday voice, in any locale, so they need no exceptions.
//
// Deliberately NOT here (yet): borderline words that double as common verbs or
// nouns in today's mainstream copy ("sync" in connector strings, "2fa" /
// "factor" / "authenticator" in the security pages, "api" in the BYO-key
// setup). Banning those now would fail the build on existing strings and force
// the app-wide rewrite that is the Round 25 plain-language sweep. They are left
// for that sweep on purpose.
//
// Bare HTTP status numbers (401, 500, ...) are intentionally NOT matched: in a
// product with finance archetypes they collide with real copy ("401(k)",
// amounts like "$500"). Raw provider errors are kept out of the UI at the
// source instead (mapped to plain copy in code), not only by this lint.
export const JARGON_TERMS = [
  "mfa", "aal2", "totp", "oauth", "sso", "jwt", "rls", "csrf",
  "ssl", "tls", "cors", "webhook", "token", "null", "undefined",
];

// Opt-in technical sections (privacy/security fine print, developer/BYO docs)
// where a precise technical term may be unavoidable. Match is by message-path
// prefix. Keep this list SMALL; add a prefix only with a one-line reason.
// Empty today: nothing user-facing currently needs an exception.
export const JARGON_EXEMPT_PREFIXES = [
  // "legal.subprocessors",  // names third-party processors in fine print
];

const ARABIC = /[؀-ۿ]/;

// A term matches a value if it appears as a standalone word. For Latin scripts
// we use Unicode letter boundaries (so "item" does not match "items" and
// "élément" does not match "éléments"; plurals are listed explicitly). For
// Arabic, attached prefixes/suffixes make letter boundaries unreliable, so we
// match the distinctive root as a substring (verified collision-free).
function termMatches(value, term) {
  if (ARABIC.test(term)) return value.includes(term);
  const re = new RegExp(`(?<![\\p{L}])${escapeRegExp(term)}(?![\\p{L}])`, "iu");
  return re.test(value);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scan a single string value for a given locale.
 * Returns an array of violation reason strings (empty if clean).
 */
export function scanValue(value, locale) {
  const reasons = [];
  if (value.includes(EM_DASH)) reasons.push("em-dash (U+2014)");
  const terms = new Set([
    ...(BANNED_TERMS[locale] ?? []),
    ...BANNED_TERMS.en, // English domain nouns are banned in every locale
  ]);
  for (const term of terms) {
    if (termMatches(value, term)) reasons.push(`banned term "${term}"`);
  }
  return reasons;
}

/** True when a message path sits under an opt-in technical section. */
export function isJargonExempt(path) {
  return JARGON_EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}.`));
}

/**
 * Scan one value for plain-language violations (opaque jargon). Path-aware so
 * opt-in technical sections can be exempted. Returns reason strings.
 */
export function scanJargon(value, path = "") {
  if (isJargonExempt(path)) return [];
  const reasons = [];
  for (const term of JARGON_TERMS) {
    if (termMatches(value, term)) reasons.push(`jargon "${term}"`);
  }
  return reasons;
}

/**
 * Recursively scan a parsed message object.
 * Returns array of { path, value, reasons }.
 */
export function scanMessages(obj, locale, path = "") {
  const out = [];
  if (typeof obj === "string") {
    const reasons = [...scanValue(obj, locale), ...scanJargon(obj, path)];
    if (reasons.length) out.push({ path, value: obj, reasons });
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      out.push(...scanMessages(v, locale, path ? `${path}.${k}` : k));
    }
  }
  return out;
}

function run() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  let total = 0;
  for (const locale of LOCALES) {
    const file = join(root, "messages", `${locale}.json`);
    const data = JSON.parse(readFileSync(file, "utf8"));
    const violations = scanMessages(data, locale);
    for (const v of violations) {
      total += v.reasons.length;
      console.error(
        `${locale}.json  ${v.path}\n    ${v.reasons.join("; ")}\n    value: ${JSON.stringify(v.value)}`,
      );
    }
  }
  if (total > 0) {
    console.error(
      `\n✖ ${total} banned-phrase violation(s) in user-facing copy. ` +
        `Canonical noun is "trackable"; remove em-dashes, banned synonyms, ` +
        `and opaque jargon (use plain language a non-technical person reads).`,
    );
    process.exit(1);
  }
  console.log("✓ i18n banned-phrase check passed (em-dash + domain-noun synonyms + plain-language jargon)");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run();
}
