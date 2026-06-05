// Dev-only helper: deep-merge a per-locale patch into messages/<locale>.json,
// preserving key order and 2-space formatting. Used to add new namespaces with
// full en/ar/fr/es parity in one pass. Not wired into any gate.
import { readFileSync, writeFileSync } from "node:fs";

export function mergeLocales(patches) {
  for (const locale of ["en", "ar", "fr", "es"]) {
    const path = `messages/${locale}.json`;
    const obj = JSON.parse(readFileSync(path, "utf8"));
    deepMerge(obj, patches[locale] ?? {});
    writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
  }
}

function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== "object") target[k] = {};
      deepMerge(target[k], v);
    } else {
      target[k] = v;
    }
  }
}
