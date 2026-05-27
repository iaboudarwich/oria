// No-op stand-in for the `server-only` marker package during Vitest
// runs. The real package throws when imported anywhere a React Server
// Component isn't the entry point; that's the right behavior at
// runtime but breaks pure-logic unit tests that import server-only
// helpers (lib/data/scope.ts, lib/utils/tz.ts, etc.).
//
// Vitest aliases the bare-specifier `server-only` to this file via
// vitest.config.ts → resolve.alias. Production builds still get the
// real package via next/dist/compiled/server-only.
export {};
