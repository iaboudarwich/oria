import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

/**
 * Vitest config for Oria's pure-logic test suites.
 *
 * Scope: lib/* and component helpers that don't touch React rendering,
 * Supabase, or the Anthropic client. UI tests, route handlers, and
 * anything that needs a real browser are intentionally out of scope —
 * those are covered by Playwright (scripts/test-scope-isolation.mts +
 * mobile-test.mts).
 *
 * Stubs:
 *   - `server-only` → empty module. The marker package throws when
 *     imported outside a React Server Component context, which is
 *     fine in prod but breaks Vitest. Aliasing to an empty module
 *     keeps the tests honest about call-site, not runtime context.
 *   - `next/cache` / `next/headers` / `next/navigation` aren't
 *     imported by the targeted helpers, so no aliases needed yet.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts"],
    // Pure logic — these should be sub-second. Cap so a flake or
    // accidental network call doesn't hang CI later.
    testTimeout: 5_000,
  },
});
