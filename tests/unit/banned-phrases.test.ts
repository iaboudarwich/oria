import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error - plain .mjs module, no types
import { scanValue, scanMessages, EM_DASH, LOCALES } from "../../scripts/check-i18n-banned.mjs";

/**
 * Guards the banned-phrase lint rule (wired into `npm run lint`).
 *
 * The rule fails the build on (a) any em-dash and (b) the banned domain-noun
 * synonyms (item / entity / thing and per-locale equivalents) in user-facing
 * i18n copy. The canonical noun is "trackable".
 */

describe("banned-phrase lint rule", () => {
  it("flags a planted em-dash", () => {
    expect(scanValue("Renews March 14 — $695", "en")).toContain("em-dash (U+2014)");
  });

  it("flags a planted English domain noun in a message value", () => {
    expect(scanValue("No items yet.", "en")).toContain('banned term "items"');
    expect(scanValue("Upload your first item", "en")).toContain('banned term "item"');
    expect(scanValue("No entities yet.", "en")).toContain('banned term "entities"');
    expect(scanValue("Things with dates show up here.", "en")).toContain('banned term "things"');
  });

  it("flags per-locale domain-noun equivalents", () => {
    expect(scanValue("Aucun élément.", "fr")).toContain('banned term "élément"');
    expect(scanValue("Aún no hay elementos.", "es")).toContain('banned term "elementos"');
    expect(scanValue("لا توجد عناصر بعد.", "ar")).toContain('banned term "عناصر"');
  });

  it("flags English domain nouns leaking into any locale file", () => {
    expect(scanValue("planted item here", "ar")).toContain('banned term "item"');
  });

  it("does not flag the canonical noun or unrelated copy", () => {
    expect(scanValue("No trackables yet.", "en")).toEqual([]);
    expect(scanValue("Aucun suivi.", "fr")).toEqual([]);
    expect(scanValue("Aún no hay seguimientos.", "es")).toEqual([]);
    expect(scanValue("لا توجد متابعات بعد.", "ar")).toEqual([]);
  });

  it("does not flag plurals as their singular (and vice-versa)", () => {
    // "items" must not be caught by the "item" pattern alone, and "trackables"
    // (the canonical) is clean; standalone-word matching prevents over-reach.
    expect(scanValue("trackable", "en")).toEqual([]);
    expect(scanValue("itemized receipt subtotal", "en")).toEqual([]); // "itemized" != "item"
  });

  it("does not flag legitimate generic words that double as the domain noun", () => {
    // These are intentionally NOT banned (legitimate non-domain uses).
    expect(scanValue("Choisissez quelque chose de plus difficile.", "fr")).toEqual([]);
    expect(scanValue("Cargar cualquier cosa", "es")).toEqual([]);
    expect(scanValue("ارفع أي شيء", "ar")).toEqual([]);
  });

  it("the live message files are clean (the rule passes today)", () => {
    const root = join(process.cwd(), "messages");
    for (const locale of LOCALES) {
      const data = JSON.parse(readFileSync(join(root, `${locale}.json`), "utf8"));
      const violations = scanMessages(data, locale);
      expect(violations, `${locale}.json should be clean: ${JSON.stringify(violations)}`).toEqual([]);
    }
  });

  it("exports the em-dash sentinel", () => {
    expect(EM_DASH).toBe("—");
  });
});
