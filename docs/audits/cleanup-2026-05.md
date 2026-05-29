# Cleanup + Performance Audit — May 2026

**Date:** 2026-05-29
**Scope:** Read-only audit of `/Users/iad/Projects/oria` at commit `0bad23d`.
**Baseline before cleanup:** 127/127 tests passing · lint clean · `tsc --noEmit` clean · `next build` succeeds · `.next/static` = 1.9 MB (chunks 1.5 MB).
**Author rules applied:** "Err on keeping" — anything under 95% confidence is flagged NEEDS REVIEW, not REMOVE. No clever refactors. No behavioral change.

This document is the deliverable for Feature 1 of the May 2026 cleanup pass. Features 2–5 (the actual edits) reference findings here by section.

---

## 0. Summary table

| Category | High-confidence actions | Needs review | Skipped (intentional) |
|---|---|---|---|
| Dead code | 2 files (1 module fully unused, 1 orphaned helper file) | 4 files (recent F2 UI primitives, browser-client) | 0 |
| Unused imports | 0 (ESLint already passes) | 0 | n/a |
| Console statements | 0 to remove | 0 | 17 intentional `.warn`/`.error` in catch blocks |
| Duplicate code | 0 qualifying under strict rule | 6 pairs (behavioral variants) | All — none are *literally* the same |
| Migrations | 0 stale | 0 | 38 migrations, all sequential, all live in remote |
| Unused deps (depcheck) | 0 to remove | 1 (`@upstash/redis` — used by a script) | 5 dev-deps flagged as false positives |
| Env vars | 6 to add to `.env.local.example` | 0 | n/a |
| DB indexes | 5 missing | 0 | — schema-level analysis only; no live `EXPLAIN ANALYZE` |
| Bundle | 1 below-the-fold lazy-load candidate | 0 | Most heavy deps are already server-only |
| Images | 0 to convert | 0 | All 5 plain `<img>` have eslint-disable + legitimate reasons |
| ISR opportunities | 0 to apply this round | 3 candidates (`/demo/*`) | `/login` and `/signup` would risk a behavior change |
| Fonts | 0 changes | 0 | Inter + JetBrains_Mono configured optimally |

**Estimated impact if F2–F5 land as planned:** ~80 lines removed, 5 new DB indexes (eliminates seq-scans on per-org reads as orgs grow), `@dnd-kit` deferred off the synchronous bundle of `/dashboard/settings`. Lighthouse will need to be captured manually (see §11).

---

## 1. Dead code — HIGH confidence

For each entry: confirmed via exhaustive grep across `app/ components/ lib/ hooks/ scripts/` for both filepath imports and all exported identifiers; checked that nothing references via `import()`, `require()`, or string lookup; not a Next.js convention file; not a test fixture; not referenced by config.

### 1.1 `lib/data/scoped-query.ts` — whole file
- **Exports:** `scopedFrom()`, `multiOrgFrom()` — query builders that were meant to be the "compile-time safety net" for org-scoped Supabase queries.
- **Verification:**
  - `grep -rn "scoped-query\|scopedFrom\|multiOrgFrom"` → only self-references inside the file.
  - Committed 2026-05-22 (`ff5d6d2`, "Scope isolation: foundational architecture pass") and never adopted by any caller. The runtime guard layer (`enforceActiveOrg`) ended up doing the same job from `lib/data/scope.ts`, which IS imported widely.
- **Breakage risk if removed:** zero — no consumers.
- **Recommendation:** **REMOVE** (F3).

### 1.2 `lib/data/reminders.ts` — whole file
- **Exports:** `listReminders(limit=50)`, `listOpenReminders(limit=10)`.
- **Verification:**
  - `grep -rn "listReminders\|listOpenReminders"` → only self-references; nobody else imports them.
  - Same May-22 commit as 1.1; superseded by per-page queries in `app/dashboard/calendar/*` and `app/dashboard/reminders/*` that compose their own filters.
  - File has exactly two exports; removing it deletes the whole module.
- **Breakage risk if removed:** zero.
- **Recommendation:** **REMOVE** (F3).

---

## 2. Dead code — NEEDS REVIEW (do not remove this round)

### 2.1 `components/ui/toast.tsx`
- **Exports:** `useToast()` hook + `ToastProvider` context.
- **Why it looks dead:** zero non-self imports.
- **Why I'm not removing:** Added 2026-05-29 (`b313683`, "feat(components): unified component library") as part of the F2 design-system roll-out. The commit message frames it as a primitive intended for adoption. The cost of keeping is one file; the cost of removing-then-readding is real work and a potential merge conflict. **LEAVE.**

### 2.2 `components/ui/card.tsx`
- **Exports:** `Card`, `CardProps` — flat/raised/floating variants with optional `hoverable`.
- **Same provenance as 2.1** (same commit, same intent).
- **Recommendation:** **LEAVE** until the design-system rollout adopts it or you explicitly decide to drop it.

### 2.3 `lib/supabase/client.ts`
- **Exports:** `createClient()` returning `createBrowserClient(...)` from `@supabase/ssr`.
- **Why it looks dead:** zero direct imports of `@/lib/supabase/client`.
- **Why I'm not removing:** It's a standard Next.js + Supabase architectural primitive (the browser client). The current codebase happens to route all client-side mutations through Server Actions, but adding any client-side Supabase usage in the future would expect this file to exist. 9 lines of code; the architectural signal is more valuable than the line savings.
- **Recommendation:** **LEAVE.**

### 2.4 `@upstash/redis` npm dependency
- **Why depcheck flags it:** zero `import` from `@upstash/redis` in `app/ components/ lib/`.
- **Why I'm not removing:** `scripts/verify-redis.ts` uses it for the Redis health-check script, and `lib/cache/dedup.ts` talks to the same Upstash endpoint via raw `fetch` (so the env vars `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are live in production). Removing the dep would break the verification script.
- **Recommendation:** **LEAVE** for now. Reconsider if `lib/cache/dedup.ts` migrates to the SDK or the verify script is retired.

---

## 3. Unused page routes

Walked every `app/**/page.tsx` and `app/**/route.ts`. For each, checked for inbound `Link href=`, `router.push`, `redirect()`, `fetch(...)`, server-action callers, and `vercel.json` cron schedules.

- All 41 page routes have at least one inbound reference (sidebar, programmatic redirect, OAuth target, or — for `/demo/*` and `/invite/code` — public landing-page links).
- Both cron routes (`/api/cron/process-uploads`, `/api/cron/send-reminders`) are scheduled in `vercel.json`.
- All 7 API routes have verified callers in client components.

**Recommendation:** none. **LEAVE all.**

---

## 4. Unused imports

```
$ npm run lint
$ npx tsc --noEmit
```

Both pass clean. ESLint (with `@typescript-eslint/no-unused-vars`) and TypeScript (with `noUnusedLocals: false`, `noUnusedParameters: false` — confirmed in `tsconfig.json`) both find zero unused imports.

**Recommendation:** **no action needed** in F2. The codebase is already clean.

---

## 5. Duplicate code — NO qualifying consolidations under the strict rule

The F4 spec says: "function A and function B do literally the same thing, replace all uses of B with A, delete B." I verified every duplicate the audit flagged. None qualifies:

### 5.1 `relativeTime` — `lib/utils.ts:9` vs `components/ask/conversation-sidebar.tsx:13`
- `lib/utils.ts` returns `"5s ago"` for under-a-minute deltas.
- `conversation-sidebar.tsx` returns `"just now"` instead.
- **Different output.** Replacing one with the other changes what the user sees.
- **Recommendation:** **LEAVE.** Worth a follow-up to standardise the wording, but that's a UX decision, not a mechanical cleanup.

### 5.2 `formatBytes` — `lib/utils.ts:1` vs `components/upload/dropzone.tsx:364`
- `lib/utils.ts` handles B → KB → MB → GB with 2-decimal GB.
- `dropzone.tsx` caps at MB (the dropzone never shows a multi-GB upload — there's a 50 MB hard cap).
- **Different range.** The dropzone version is intentionally simpler.
- **Recommendation:** **LEAVE.**

### 5.3 `formatTime` — `components/calendar/calendar-shared.tsx:143` vs `components/dashboard/today-pulse.tsx:193`
- The today-pulse version compares against "today" and substitutes `"All day"` / a relative string; calendar-shared is straight time-of-day.
- **Different behavior.**
- **Recommendation:** **LEAVE.**

### 5.4 `formatDate` — `components/upload/suggested-reminders-panel.tsx:7` vs `components/upload/extracted-entities-panel.tsx:47`
- One is defensive (try/catch around the parse), one isn't.
- One forces UTC, the other uses the browser locale.
- **Different output.**
- **Recommendation:** **LEAVE.**

### 5.5 `friendlyDate` — `components/calendar/coming-up.tsx:59` vs `components/upload/item-review-panel.tsx:204`
- Same output format, **different input types** (`string` vs `Date`).
- A consolidation would have to change a signature, which the F4 spec calls out specifically as off-limits ("Changing function signatures").
- **Recommendation:** **LEAVE.**

### 5.6 `SmartSection` type — `lib/supabase/types.ts:247` vs `lib/ai/extract.ts:44`
- Both declare `export type SmartSection = "diet" | "bills";` byte-identically.
- This is the **only** literal duplicate I found.
- **Why I'm still not consolidating:** `lib/ai/extract.ts` is marked `import "server-only"`. Re-exporting `SmartSection` from extract into types.ts would taint types.ts with server-only on the type-resolution graph. Going the other way (delete from extract, import from types) is fine but introduces a cross-module type dependency for one literal line saved.
- **Recommendation:** **LEAVE.** Documented for your call.

### 5.7 `AgentMessage` / `AgentTelemetry` — `lib/ai/agent.ts:8,16` vs `lib/ai/work-agent.ts:8,16`
- Byte-identical type declarations across both server-only agent modules. Added in the May 28 telemetry pass (`af23f78`).
- **Why I'm not consolidating:** intentional domain isolation between the Ask agent and the Work agent. They could share a `lib/ai/agent-types.ts` but that's the "reorganize for elegance" the spec rules out.
- **Recommendation:** **LEAVE.**

**F4 net result: no commit needed.** Documented below in §13 alongside everything else skipped.

---

## 6. Stale migrations

Listed every file under `supabase/migrations/`. Cross-referenced against `supabase migration list` (remote). All 38 migrations (0001 → 0038) are applied to the linked Supabase project. No supersession patterns (column added then dropped). `0009_sync_custom_sections.sql` is an idempotent safety re-assertion, not a stub. `supabase/.temp/` contains only CLI metadata (versions, project ref); no orphan SQL.

**Recommendation:** **LEAVE all 38 migrations.** Any cleanup here would risk breaking the migration history.

---

## 7. Unused dependencies (`npx depcheck` + manual verification)

Raw depcheck output:

```
Unused dependencies:    @upstash/redis
Unused devDependencies: @tailwindcss/postcss, @types/react-dom, playwright, tailwindcss, tsx
```

Per-finding verification:

| Finding | Verdict | Why |
|---|---|---|
| `@upstash/redis` | **KEEP** | Used by `scripts/verify-redis.ts`. Production paths talk to Upstash via raw fetch (`lib/cache/dedup.ts`), not the SDK. |
| `@tailwindcss/postcss` (dev) | **KEEP** | Active PostCSS plugin used at build time. depcheck doesn't see PostCSS config. |
| `tailwindcss` (dev) | **KEEP** | Tailwind core used by every styled component. depcheck doesn't see CSS imports. |
| `@types/react-dom` (dev) | **KEEP** | TypeScript types for React DOM; used implicitly by `tsc`. |
| `playwright` (dev) | **KEEP** | `scripts/test-scope-isolation.mts` and `mobile-test.mts` use it. |
| `tsx` (dev) | **KEEP** | Used to run `.ts` / `.mts` scripts (e.g. `npx tsx scripts/verify-redis.ts`). |

depcheck produces only false positives on this repo. **Recommendation: no removals.**

---

## 8. Environment variables

### 8.1 In `.env.local.example` but never read in code
- None. Every documented var has a `process.env.X` consumer.

### 8.2 Read in code but missing from `.env.local.example`
The following 6 variables are referenced in source but undocumented:

| Var | Used at | Note |
|---|---|---|
| `PYTHON_EXTRACTION_URL` | `lib/extraction/service.ts:20` | URL of the Python sidecar. |
| `ORIA_SIDECAR_SECRET` | `lib/extraction/service.ts:36` | HMAC signing secret for sidecar requests. Optional in dev. |
| `ORIA_TEXT_EXTRACTION_MODEL` | `lib/ai/extract.ts` (model routing for typed quick-logs) | Optional override; defaults to Haiku. |
| `SENTRY_DSN` | `sentry.server.config.ts`, `sentry.edge.config.ts` | Server / edge error reporting. |
| `NEXT_PUBLIC_SENTRY_DSN` | `sentry.client.config.ts` | Client error reporting. |
| `CRON_SECRET` | `vercel.json` cron + auth check in the cron route handlers | Bearer-token gate for `/api/cron/*`. |

`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are already documented (mentioned in the `lib/cache/dedup.ts` header comment, and read by `scripts/verify-redis.ts`); confirm they're in `.env.local.example`.

**Recommendation:** **ADD all 6 to `.env.local.example`** in F2.

---

## 9. Console statements

Total in `app/ components/ lib/` (excluding `scripts/`, `python/`, `node_modules/`, `.next/`): **17**.

Breakdown:

- 0 × `console.log`
- 0 × `console.debug`
- 0 × `console.info`
- 14 × `console.warn` (all in `catch` blocks of network / extraction / cache calls, prefixed like `[cache/dedup]` for grep-ability)
- 3 × `console.error` (Sentry-adjacent: `[embedding/store] upsert error`, two `[send-invite]` failure paths)

Every one is an intentional operational log. None is a debug leftover.

**Recommendation:** **no removals.** F2 has nothing to do for this section.

---

## 10. Database — schema-level index review

Live `EXPLAIN ANALYZE` was out of scope (no live DB connection in this audit environment). Instead I walked every migration to build a list of tables + columns, then grepped `lib/data/*.ts` for the columns actually filtered on, and flagged columns that are queried but unindexed.

Postgres does **not** auto-index foreign-key referencing columns, so a column being `REFERENCES foo(id)` does **not** mean it's indexed.

### 10.1 Missing org-scoped indexes (HIGH impact as orgs grow)

| Table | Column(s) | Used at (example) | Today's plan |
|---|---|---|---|
| `custom_sections` | `organization_id` | sidebar build, every dashboard page | seq scan |
| `section_settings` | `organization_id, builtin_section` | sidebar order / visibility | seq scan |
| `memberships` | `organization_id` | circle/office member lists, invites | seq scan |
| `reminders` | `organization_id, due_at` | calendar, "what's coming up" rollups | seq scan + sort |
| `document_chunks` | `organization_id` | semantic search org-scoping | seq scan |

Existing `0023_perf_indexes.sql` already indexes `uploads.uploaded_by`, `uploads (uploaded_by) where deleted_at is null`, `learning_events (actor_id, kind, created_at)`, and `background_jobs (started_at) where status='processing'` — those are good and not duplicated below.

**Recommendation:** **add migration `0039_org_scoped_indexes.sql`** (F5). Each `CREATE INDEX IF NOT EXISTS` so it's safe to re-run.

### 10.2 N+1 patterns

Grepped `lib/data/*.ts` and `app/**/page.tsx` for `.map(async ...)` followed by Supabase calls, and for `for (... of ...)` loops issuing queries. Found none. The codebase consistently uses `Promise.all([...])` for parallel reads (e.g., `system-health.ts:305`) and `.in("id", [...])` for bulk lookups (e.g., `app/dashboard/things/[id]/page.tsx:25`).

**Recommendation:** **no N+1 work needed.**

---

## 11. Bundle audit

### 11.1 Baseline (Turbopack, Next 16.2.6)

`.next/static` = **1.9 MB total** (`.next/static/chunks` = 1.5 MB).

Turbopack doesn't print per-route bundle sizes the way Webpack did, so route-level deltas need a `.next/static` size snapshot before and after. Heaviest client chunks today:

```
308K  107-odg5gj2jp.js
224K  12zinpu_b-c86.js
112K  03~yq9q893hmn.js
108K  0~4kh290rspvc.js
 56K  031znkmtoex71.js
 52K  16xr-8d8szmyn.js
 44K  00k5ef_00aoud.js
 36K  14bo0s7tiz9rn.js
 36K  0fbpra2clj114.js
 36K  0bclolnkp2sjw.js
```

### 11.2 Dependency cost (client-relevant only)

Mapped every `package.json` dep to its import sites and whether the consuming file is `"use client"` or server-only:

| Dep | Client? | Note |
|---|---|---|
| `@anthropic-ai/sdk` | **No** | Only in `lib/ai/*` and `lib/extraction/*` — server-only. Zero bundle. |
| `@sentry/nextjs` | **Yes** (split) | Already split via `sentry.{client,server,edge}.config.ts`. Tree-shaken by the Sentry plugin. Leave. |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | **Yes** | One consumer: `components/settings/sections-editor.tsx`. Currently ships synchronously on `/dashboard/settings` and `/dashboard/settings/sections`. **Candidate for `next/dynamic` with a skeleton fallback** — it's below the fold on `/dashboard/settings`. |
| `next-intl` | **Yes** | Required globally for i18n. Leave. |
| `next-themes` | **Yes** | Small; needed for dark mode. Leave. |
| `heic-convert`, `mammoth`, `pdf-parse` | **No** | Server-only (extraction). Zero bundle. |
| `resend` | **No** | Server-only (email send). Zero bundle. |
| `xlsx` | — | Confirmed REMOVED in the recent security pass. Not in `package.json`. |

### 11.3 Layout-imported heavy components

Walked `app/layout.tsx` and `app/dashboard/layout.tsx`. The only client wrappers are `<NextIntlClientProvider>` + `<ThemeProvider>` (root) and `<SidebarShell>` (dashboard). None of them import modals, pickers, or heavy editors.

**Recommendation:** in F5, wrap `<SectionsEditor>` with `next/dynamic({ ssr: true, loading: ... })` on `/dashboard/settings`. Keep the dedicated `/dashboard/settings/sections` route loading it synchronously (it's the whole page).

---

## 12. Image audit

Found **5** plain `<img>` tags. **Every one** has an `eslint-disable-next-line @next/next/no-img-element` comment AND a legitimate reason not to be a `next/image`:

| File | Line | Source | Reason to keep `<img>` |
|---|---|---|---|
| `app/dashboard/things/[id]/page.tsx` | 147 | Signed Supabase URL (32×32 thumb) | Dynamic signed URL, fixed container |
| `components/search/live-search.tsx` | 432 | Signed Supabase URL (32×32 thumb) | Same pattern |
| `components/upload/dropzone.tsx` | 349 | `URL.createObjectURL(file)` blob | next/image can't serve blob URLs |
| `components/upload/preview.tsx` | 26 | Signed URL, unknown intrinsic dims, `max-h-[720px] w-auto` | Documented "leave as plain `<img>`" in the previous session |
| `components/upload/dropzone-compact.tsx` | 194 | Blob preview, same as dropzone | next/image can't serve blob URLs |

**Recommendation:** **no conversions.** Each `<img>` is intentional.

---

## 13. Lighthouse + manual smoke metrics

I cannot run Lighthouse in this audit environment (no headless browser tool). The Results table at the bottom of this doc has placeholders for you to fill in after running:

```
npx lighthouse https://heyoria.com --output=json --output-path=./lighthouse-after.json --only-categories=performance,accessibility,best-practices,seo
```

Capture before applying F2–F5 (current state) and after (post-deploy).

---

## 14. Caching + ISR

Walked every `app/**/page.tsx`. Pages worth flagging:

- `app/dashboard/layout.tsx` → `dynamic = "force-dynamic"` (correct; per-user data)
- `app/dashboard/admin/health/page.tsx` → `force-dynamic` (correct; ops snapshot)
- `app/login/page.tsx` → currently dynamic by inference
- `app/signup/page.tsx` → currently dynamic by inference
- `app/demo/*/page.tsx` → currently dynamic, but contents are static persona pages

Why I'm not adding `revalidate` to `/login` or `/signup` this round: both call `auth.getUser()` and redirect to `/dashboard` if the user is already signed in. Adding `revalidate` would cache the unauthenticated HTML and skip that server-side check on the next request, which **is** a behavior change (a stale-cache user could see the login form briefly before client-side recovery, or vice versa). The spec is explicit: "no behavioral change."

For `/demo/*`, the same caution applies if the demo personas ever query live data. I haven't verified that in depth; flagging as **NEEDS REVIEW**, not applying.

**Recommendation:** **defer ISR work** to a follow-up round with explicit behavior-change scope.

---

## 15. Fonts

`app/layout.tsx`:

```ts
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});
```

`next/font/google` enables `preload: true` by default; explicit weights are set on the mono font to avoid pulling all 9 weights. **Already optimal.**

**Recommendation:** **no changes.**

---

## 16. Expected impact (pre-cleanup forecast)

| Metric | Estimate |
|---|---|
| Lines of code removed (F3) | ~80 (2 small files) |
| Files removed | 2 |
| `.next/static` size reduction | Marginal — the only client-removable change is `@dnd-kit` deferral; the SDK was already only shipping to settings routes. Expect 0 → ~30 KB synchronous reduction on `/dashboard/settings` first paint. |
| DB query improvements | Eliminates seq scans on `custom_sections.organization_id`, `section_settings.organization_id`, `memberships.organization_id`, `reminders.organization_id + due_at`, `document_chunks.organization_id` — most noticeable as orgs accumulate rows. |
| Env-var documentation | 6 vars added to `.env.local.example`. |
| Lighthouse delta | Capture manually (§13). |

---

## 17. Items deliberately skipped (your call)

Listed here so you can override.

1. **Remove `components/ui/toast.tsx` + `components/ui/card.tsx`** — recent design-system primitives queued for adoption. Per "err on keeping". (See §2.1, §2.2.)
2. **Remove `lib/supabase/client.ts`** — standard Next.js architectural primitive; removing makes the next "I need a browser client" change harder. (See §2.3.)
3. **Remove `@upstash/redis` dep** — used by `scripts/verify-redis.ts`. (See §2.4.)
4. **Consolidate any of the duplicate utilities** — none qualify under the strict F4 rule. (See §5.)
5. **Migrate `SmartSection` to a single canonical declaration** — only safe option introduces a cross-module type dep for one line saved. (See §5.6.)
6. **Add `revalidate` to `/login` / `/signup` / `/demo/*`** — behavioral change risk. (See §14.)
7. **Capture Lighthouse + `EXPLAIN ANALYZE` numbers** — requires environment I don't have. Stubs are in §11 and §18 for the manual capture.

---

## 18. Results (filled after F2–F5)

| Metric | Before | After | Delta |
|---|---|---|---|
| Tests passing | 127/127 | 127/127 | unchanged ✓ |
| `npm run lint` | clean | clean | unchanged ✓ |
| `tsc --noEmit` | clean | clean | unchanged ✓ |
| `next build` | success | success | unchanged ✓ |
| `.next/static` total | 1904 KB | 1904 KB | unchanged — `next/dynamic` defers, doesn't shrink total |
| `.next/static/chunks` total | 1564 KB | 1564 KB | unchanged — same |
| Synchronous load on `/dashboard/settings` | included `@dnd-kit/*` (~25–35 KB minified) | excludes `@dnd-kit/*` until "Sections" tab opens | deferred |
| Files removed | 0 | 2 | `lib/data/scoped-query.ts`, `lib/data/reminders.ts` |
| Lines removed | 0 | 100 | 62 (scoped-query) + 38 (reminders) |
| Files added | 0 | 2 | `supabase/migrations/0039_org_scoped_indexes.sql`, `components/settings/sections-editor-lazy.tsx` |
| New env-var docs in `.env.local.example` | 0 | 8 | PYTHON_EXTRACTION_URL, ORIA_SIDECAR_SECRET, ORIA_TEXT_EXTRACTION_MODEL, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, CRON_SECRET |
| New migrations | 0 | 1 | `0039_org_scoped_indexes.sql` — 5 indexes |
| DB indexes added | 0 | 5 | `custom_sections(org)`, `section_settings(org, builtin_section)`, `memberships(org)`, `reminders(org, due_at)`, `document_chunks(org)` |
| Lighthouse — Performance | _capture manually before_ | _capture manually after_ | run `npx lighthouse https://heyoria.com --only-categories=performance` |
| Lighthouse — Accessibility | _capture manually before_ | _capture manually after_ | — |
| Lighthouse — Best Practices | _capture manually before_ | _capture manually after_ | — |
| Lighthouse — SEO | _capture manually before_ | _capture manually after_ | — |

### Commits applied

| Feature | Commit | What landed |
|---|---|---|
| F1 — audit doc | `ee622de` | This document. |
| F2 — safe cleanup | `3cdedf4` | 8 missing env vars added to `.env.local.example` (PYTHON_EXTRACTION_URL, ORIA_SIDECAR_SECRET, ORIA_TEXT_EXTRACTION_MODEL, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN, CRON_SECRET). No unused-import removals (codebase already clean). No console-statement removals (all 17 are intentional). No type/dep removals (audit found no qualifying targets). |
| F3 — dead code removal | `f9cc770` | `lib/data/scoped-query.ts` and `lib/data/reminders.ts` deleted. Both re-verified to have only self-references before deletion. Build + tests green after each. 100 lines removed. |
| F4 — consolidation | _no commit_ | No qualifying consolidations under the strict spec rule. Every flagged duplicate either has behavioral variants or crosses the server-only boundary in a way the spec rules out. See §5 + §17.4. |
| F5 — performance | _filled by next commit_ | Migration `0039_org_scoped_indexes.sql` (5 org-scoped indexes — see §10.1) + `components/settings/sections-editor-lazy.tsx` (`next/dynamic` wrapper deferring `@dnd-kit/*` off the synchronous `/dashboard/settings` bundle). |
