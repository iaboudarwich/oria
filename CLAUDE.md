@AGENTS.md

# Standing rules for every round

Follow these at the start of and throughout every round. They are not
optional.

## Before starting

- Confirm location and a clean tree: `pwd` is `~/Projects/oria`, on `main`,
  in sync with origin, working tree clean (a modified `.claude/settings.local.json`
  is local-only and is kept out of commits).
- Read `docs/perf/2026-06-baseline.md` before any work that could affect page
  performance; you will compare against it.

## While working

- No performance regressions. Before committing a feature, check the pages it
  touches against the perf baseline. If a number moved the wrong way, fix it
  before committing. Keep expensive work (summaries, profile reads, AI calls)
  parallel to the main data fetch, never sequential on the render path.
- Stay scoped to the feature. No drive-by edits to unrelated code. The one
  sanctioned cross-feature cleanup is the end-of-round audit pass.
- All new user-facing copy goes in all four language files (en, ar, fr, es).
  Arabic may be machine-translated; preserve placeholders and structure.
- No em-dashes (U+2014) anywhere in code or copy. The lib/ai regression test
  enforces it for prompts; hold the same bar everywhere.

## Quality gates (green at every commit)

- `npm run build`, `npm test`, and `npm run lint` must all pass. Lint has two
  known pre-existing warnings (`mfa-actions.ts`, `audit-storage-rls.ts`); zero
  errors and no new warnings.
- Migrations are sequential and applied to production via
  `npx supabase db push` after the code is ready, before the deploy lands.

## Audit your own diff before committing

At the end of each feature, scan the diff you wrote and clean up what you
introduced:

- Unused imports / dead variables: remove.
- A helper defined once and called once: leave it (do not refactor for its own
  sake).
- A helper duplicated across files: consolidate.
- `console.log` left behind: remove.
- Dead branches (a switch case never hit): remove if safe, comment if unsure.
- Slow paths added (N+1 queries, sequential awaits where parallel works): fix.

## Finishing

- Push to `origin/main`; Vercel auto-deploys. Verify the deploy reaches READY.
- Commit with the author email `issamlife21@gmail.com`.
- Deliver the standard final report: each feature with files touched,
  translations confirmed, migrations applied, anything skipped/deferred with a
  reason, and a smoke-test checklist.
