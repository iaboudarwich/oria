import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Full jsx-a11y recommended ruleset on top of the subset next/core-web-vitals
  // ships, so accessibility regressions fail the gate (Round: design infra).
  // next already registers the jsx-a11y plugin, so we add only the rules (no
  // second `plugins` registration, which the flat preset would do and clash on).
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Adopting jsx-a11y on a mature codebase: the rules with no current
      // violations stay as errors (the gate now blocks any NEW one), while the
      // pre-existing, judgment-heavy categories below are a visible WARN backlog
      // worked down over time (intentional autofocus in focus flows, deliberate
      // interactive wrappers, legacy label markup). Runtime axe-core
      // (scripts/verify-a11y.mjs) remains the strict AA gate on key routes.
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
      // Intentional, correct patterns the rule over-flags: tabIndex={0} on a
      // role="group" scroll container is the WCAG scrollable-region-focusable
      // pattern; user-UPLOADED audio/video has no caption track to add.
      "jsx-a11y/no-noninteractive-tabindex": "warn",
      "jsx-a11y/media-has-caption": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python venv — contains vendored JS that should never be linted
    "python/.venv/**",
    // Storybook build output + the visual-regression snapshots.
    "storybook-static/**",
    "tests/visual/**",
  ]),
]);

export default eslintConfig;
