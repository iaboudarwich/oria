# CLAUDE.md — Oria Standing Brief

Read this file at the start of every round. It contains thesis, stack, rules, and the protocol every change must follow.

---

## 1. What Oria is

**Oria is the personal operating system that builds itself around each user.**

**Tagline:** Your second brain and right arm. Find. Ask. Act.

Oria connects to a user's accounts (Gmail, Calendar, Drive, WHOOP, banks, more), extracts what matters, surfaces it on a self-organizing Today page, and acts on it through write-back. The dashboard, the connectors offered, the suggestions, the prep cards, all shape themselves to who the user is via an onboarding interview and continuous learning.

**Launch archetypes (locked):** Renter, Parent, Freelancer, Frequent Traveler, Teacher, Caregiver, Investor, Family Office Principal, Custom. Every template, every connector recommendation, every Ask answer flexes around these.

**Beta is free. Launch is invite-only (5 users to start). No Stripe at launch. Billing comes in Round 31 after a legal entity (Round 35).**

---

## 2. Stack

- **Frontend:** Next.js (App Router) on Vercel. PWA from Round 15 onward. Capacitor wrap post-launch.
- **Database:** Supabase Postgres. Migrations sequential, applied via `supabase db push` after commit.
- **Python sidecar:** Railway. Handles 384-dim MiniLM embeddings and heavy extraction.
- **Infrastructure AI (always Oria's Anthropic key):** classification, extraction, sidecar reasoning, behind-the-scenes work. Costs eaten by Oria.
- **Conversation AI (user's connected provider, else Oria's default):** Ask Oria, suggestions, Daily Journal, surfaces the user sees. BYO Claude/ChatGPT/Gemini supported; their memory uses the provider's native memory system.
- **Voice:** Oria's OpenAI/Whisper, always.
- **Analytics:** PostHog from Round 20. Token counts, latencies, tiers only. Never raw content.
- **Errors:** Sentry. PII-scrubbed.
- **Email:** Resend (heyoria.com domain verified).
- **Cache/queues:** Upstash Redis.
- **Storage:** Cloudflare R2.

**Working directory:** `~/Projects/oria`. Main branch. Never work in detached HEAD.

---

## 3. Operating principles (the 19)

These hold across every round, every commit, every file. No exceptions unless this file is updated first.

1. **No em-dashes anywhere.** Use commas, periods, parentheses, or a colon. Sweep before commit. A planted em-dash must fail lint.
2. **All user-facing copy lives in en/ar/fr/es with full parity.** Arabic gets RTL. New strings ship in all four or the round is not done.
3. **Audit-log every action that touches user data.** Read, write, share, delete, export. Table: `audit_log`. The user can see their own log.
4. **Soft-delete is the default.** Hard delete only on explicit "delete forever" + 30-day grace.
5. **Provider abstraction is the seam.** Conversation AI calls go through the provider seam (`lib/ai-providers/`, with classifiers in `lib/ai/classifiers/` and the Ask endpoint at `app/api/ask/route.ts`). Never call Anthropic/OpenAI/Gemini SDKs directly from a page or route.
6. **Infrastructure AI is always Oria's Anthropic key.** Classification, extraction, embeddings, suggestion generation. User-connected providers never run infrastructure work.
7. **Voice rules wrap every LLM call.** The voice rules in `docs/voice/oria-voice.md` (tone, banned-phrase guards, length budgets) are applied through the AI seam (`app/api/ask/route.ts` + `lib/ai-providers/`). No raw model output ships to the user.
8. **Schema-first migrations, numbers assigned at build time.** Never hand-number a migration file. Run a schema-reality check before every migration, what's in the DB vs what the migration assumes.
9. **Gates must be green at every commit:** `npm run build`, `npm test`, `npm run lint`, em-dash sweep, i18n parity check.
10. **Bespoke design system.** Components live in `components/`. No new framework chrome (no shadcn drops, no Material). Tokens in the `@theme` block of `app/globals.css` are the only source for color, spacing, radius, type.
11. **Single responsibility per file.** A page is a page. A route is a route. A helper is a helper. Co-located file under 400 lines or split.
12. **No new on old.** When refactoring, replace cleanly. Don't leave both the new and the old wired. Dead code is a bug.
13. **Templates are internal.** The user sees their context (Personal, Investor, Business, Family Office). They never see the word "template."
14. **Terminology lock (see §5).** Use canonical names. Banned synonyms fail lint (em-dash + domain-noun synonyms in i18n, via `scripts/check-i18n-banned.mjs`).
15. **Trust copy is non-negotiable** (see §7). Privacy step appears before Connect. Honest-limit line stays on the homepage.
16. **Rate limits exist and are graceful.** Oria-default users hit per-user Ask caps. BYO users are exempt. Messaging is human, never technical.
17. **No drive-bys.** A round changes what its scope says it changes. Found dead code in a file you weren't touching? Note it in the report, don't fix it this round.
18. **Standard final report** at the end of every round (see §5).
19. **Plain language, always.** Every user-facing string (labels, buttons, errors, alerts, notifications, empty states) must read as plain language a non-technical person understands. Never surface jargon or a raw provider error: no MFA, AAL2, TOTP, OAuth, token, RLS, sync, null, undefined, 401/403, stack traces, or copied SDK messages. Map provider errors to plain copy at the source. The only exception is opt-in technical sections (privacy/security fine print, developer/BYO docs). The banned-phrase guard (`scripts/check-i18n-banned.mjs`, `JARGON_TERMS`) fails the build on a planted jargon term like an em-dash; its small documented exemption list (`JARGON_EXEMPT_PREFIXES`) covers the technical sections. A full app-wide rewrite of legacy strings is the Round 25 sweep, not this guard; borderline words still live in old copy (sync, 2fa, factor, api) are deliberately not yet in the blocklist.

---

## 4. Standing protocol — every round, every time

### Pre-flight (before writing any code)
1. `pwd` — must be `~/Projects/oria`.
2. `git status` — must be clean, on `main`, up to date.
3. Kill stray shells, dev servers, watchers from prior rounds. One terminal, one focus.
4. Read this file. Read the round prompt. Read every skill the round prompt names.
5. If the round modifies the DB: pull the current schema (`supabase db pull` or inspect via dashboard) and confirm assumptions match reality before writing any migration.

### During the round
- Stay scoped. The round prompt is the contract.
- Run the dev server. Visually verify what you build as you build it, do not assume.
- Run `npm test` after every significant change, not just at the end.
- If you discover something the round prompt didn't anticipate (broken assumption, missing migration, hostile interaction with another feature), stop and surface it. Don't silently rewrite scope.

### Pre-commit
1. `npm run build` — must pass.
2. `npm test` — must pass.
3. `npm run lint` — must pass (this includes the em-dash rule and the banned-phrase rule).
4. i18n parity check: every new key exists in en, ar, fr, es.
5. Diff audit: walk your own diff. Dead imports, dead vars, `console.log`, stale comments, duplicate helpers. Clean before commit.
6. Migration safety: number assigned, schema-reality check passed, rollback noted in commit message if destructive.
7. **Clean-clone check (from Round 16's deploy failure):** `git status` must show NO untracked source the build imports. A local build passes against files on disk even when they were never committed; the Vercel clone has only what's committed. Before declaring done, stage every new source file and confirm the Vercel deploy reaches READY, not just the local build.

### Commit
- Format: `type(scope): one sentence summary`. Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`, `i18n`.
- Body explains the *why* if non-obvious. Diff explains the *what*.

### Final report (standard format)
At the end of every round, output a report with these exact sections:

```
ROUND X — [name]

WHAT SHIPPED
- bullet
- bullet

FILES TOUCHED
- path/to/file.ts (created | modified | deleted)
- ...

MIGRATIONS
- 00XX_name.sql — applied via supabase db push, [what it does]
- (or "none this round")

TESTS
- before: 197 passing
- after: 203 passing (6 new)
- coverage: [if changed]

GATES
- build: pass
- test: pass
- lint: pass
- em-dash sweep: pass
- i18n parity: pass

DEFERRED / FLAGGED
- anything intentionally not done, with reason
- anything I noticed but stayed out of scope on

NEXT STEP
- what should happen next, in one line
```

---

## 5. Terminology lock

Canonical terms. Synonyms fail lint.

| Use | Don't use |
|---|---|
| Ask Oria | chat, chatbot, assistant |
| connector | integration, plugin |
| Records (people/vehicles/properties area, /dashboard/things) | item, entity, thing |
| Trackables (renewals/subscriptions/expiries, /dashboard/trackables) | item, entity, thing |
| Today | dashboard, home, feed |
| Circle | group, team, household |
| context (Personal/Investor/Business/Family Office) | template, persona |
| routine | automation, workflow |
| suggestion | recommendation, tip |
| write-back | action, sync-out |
| BYO | bring-your-own, custom AI |

The banned-phrase lint guard (`npm run lint` -> `scripts/check-i18n-banned.mjs`)
fails the build on any em-dash, on item/entity/thing (and the per-locale
equivalents), and on opaque jargon (principle 19, `JARGON_TERMS`) in user-facing
i18n copy. It does NOT ban "Records" or "Trackables": those are the two
legitimate canonical nouns. Records = the people/vehicles/properties area;
Trackables = the renewals feature.

---

## 6. Voice layer

All user-facing LLM output is shaped by one canonical voice block, `VOICE_RULES`
in `lib/voice/oria-voice.ts` (derived from `docs/voice/oria-voice.md`). That
module is the SINGLE SOURCE OF TRUTH (Round 14.7): Ask (`lib/ai/agent.ts`), the
Work agent (`lib/ai/work-agent.ts`), and the daily routines + journal
(`lib/daily/generate.ts`) all import `VOICE_RULES` and append their own content
rules. No surface keeps its own copy of the voice. The same block reaches every
provider intact because system-prompt handling is normalized once in
`lib/ai-providers/system-prompt.ts` (Anthropic `system` field, OpenAI system
message, Gemini / o-series folded into the first user turn), so Anthropic /
OpenAI / Gemini yield the same voice and structure for the same request.

`lib/voice/oria-voice.ts` also exports `BANNED_PHRASES` + `findBannedPhrases`
(the anti-slop guard) and `sweepEmDash` (the post-hoc em-dash safety net for
non-streamed generations). Edit `docs/voice/oria-voice.md` and `VOICE_RULES`
together. Infrastructure AI (extraction, classifiers) is NOT voice-bearing and
deliberately does not import the voice block. Read the doc before editing voice.

Hard bans (these never appear in user-facing copy from any model):
- em-dashes
- "I'm here to help"
- "As an AI"
- "Feel free to"
- "Let me know if"
- "It's important to note"
- "Don't hesitate"
- "I'd be happy to"
- "Let's dive in"
- "Game-changer"
- "Unleash"
- "Empower"

Tone: direct, warm, unsentimental. Never performative. Reads like a calm friend who happens to know everything.

---

## 7. Trust messaging

Read `docs/trust/messaging.md` before editing any privacy, onboarding, or settings copy.

Non-negotiables:
- Privacy step appears **before** the first Connect prompt.
- The onboarding privacy slide is two columns: what we do / what we don't do. Plain English, four languages.
- `/trust` page lives at heyoria.com/trust. `/trust/subprocessors` lists every third party.
- The honest-limit line on the homepage stays.

---

## 8. Skills

When a round prompt names a skill, read the SKILL.md at that path before writing code. Common ones for Oria:

- design contract for every UI round: `docs/design/heuristics.md` plus the `@theme` tokens in `app/globals.css` (there is no frontend-design skill; do not add shadcn/Radix/ui-ux-pro-max)
- `pdf` / `pdf-reading` — statement extraction, document handling
- `docx` / `xlsx` / `pptx` — native document types (Round 17.5), export suite (post-launch)
- `mcp-builder` — Oria MCP server (post-launch A)
- `product-self-knowledge` — anything touching Anthropic SDK/Memory tool/Batch API

---

## 9. What never gets built

- Apple IAP (web Stripe only)
- Bill negotiation (legal/regulatory exposure)
- Screen capture / always-on listening
- Cinematic marketing video before users
- Everything at once (one round at a time)

---

## 10. PWA (Round 15)

Oria is an installable, offline-capable, push-ready PWA.

**Icons.** Source is `public/logo.svg` (the "Oria" wordmark master), rendered
pixel-accurate to `public/brand/oria-1024.png`. `scripts/generate-icons.mjs`
(sharp) resizes that raster master onto the canvas field and emits
`public/icons/` (192, 512, 512-maskable scaled into the safe zone, apple-touch
180) plus `app/favicon.ico` (16/32/48). Re-run after a logo change. The brand is
a horizontal wordmark with no emblem, so it is illegible at favicon (16px) and
cramped under a circular maskable mask; a monogram for small-icon contexts is a
pending brand decision (do not invent one). The in-app `Wordmark` component is
still the hand-built "O" disc + sans "Oria" and has not been changed to match.

**Icon cache-busting.** Filenames stay constant across logo changes, so a `?v=`
query busts stale copies. `lib/brand/icon-version.ts` (`ICON_VERSION` +
`versionedIcon`) is the source: `app/manifest.ts` (the three icons),
`app/layout.tsx` (apple-touch), and the install prompt all version their URLs;
`app/favicon.ico` is content-hashed by Next automatically (no `?v=` needed).
`public/sw.js` carries its own `ICON_VERSION`/`VERSION` (it is plain JS, cannot
import), bumped in lockstep. Bump all three (the TS const + the two in `sw.js`)
on any icon change. LIMIT: an already-installed app caches its icon at OS
install time. Versioning refreshes browser tabs and, over time, Android +
desktop installed PWAs; it does NOT refresh an icon already on the iOS Home
Screen or the macOS dock, which only update after remove + re-add.

**Manifest.** `app/manifest.ts` (Next metadata route, `/manifest.webmanifest`):
display standalone, start_url/scope `/`, theme/background from the `--canvas`
token, the icons wired with the maskable purpose. Description localized; name
stays "Oria".

**Service worker (`public/sw.js`).** Hand-rolled (Serwist's webpack injection is
unreliable on this Turbopack build, and an explicit allow-list is the safest way
to honor the no-auth-caching rule). Registered production-only via
`components/pwa/sw-register`; unregistered in development. Caching policy:

- **Navigations (HTML): network-first, NEVER cached.** On failure they fall back
  to the precached `/offline` shell (`app/offline`, branded + localized, no user
  data). So authenticated page HTML can never enter Cache Storage.
- **Runtime cache: a tight allow-list only.** Same-origin `/_next/static/*`
  (built JS/CSS + self-hosted fonts), `/icons/*`, `/favicon.ico`, `/logo.svg`.
- **Everything else passes straight through to the network, uncached:** `/api/*`,
  `/_next/image`, cross-origin, signed file URLs. No user content (documents,
  finances, health, calendar) can match the allow-list, so none is ever cached.
- Bump `VERSION` in `sw.js` to invalidate old caches.

**iOS.** `app/layout.tsx` sets apple-touch-icon, apple-mobile-web-app-capable,
status-bar-style, light/dark theme-color, and viewport-fit cover.
`lib/pwa/standalone.ts` exposes `isStandalone()` / `isIos()`. iOS Web Push
requires the app installed to the Home Screen on iOS 16.4+.

**Install affordance.** `components/pwa/install-prompt.tsx`: captures
`beforeinstallprompt` on Chromium; on iOS shows an Add-to-Home-Screen sheet.
Dismissal persists in localStorage. Hidden when already installed.

**Web Push.** Opt-in only, from the settings toggle
(`components/pwa/push-toggle.tsx`); permission is never requested on load.
Subscriptions live in `push_subscriptions` (migration 0070, RLS per-user,
audit-logged `push.subscribed` / `push.unsubscribed`). Client:
`lib/pwa/push-client.ts`. Server send: `lib/push/web-push.ts` (prunes dead
endpoints; disables gracefully if env is missing). Routes:
`/api/push/subscribe` (POST/DELETE) and `/api/push/test` (gated to the
authenticated user AND dev-or-admin; only ever targets the caller).
**Push payloads must stay generic** ("You have a new reminder in Oria"); never
put financial, health, or document detail in a payload (it transits
Apple/Google/Mozilla). Specifics are fetched in-app on tap.

**VAPID env (three vars).** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client, public),
`VAPID_PRIVATE_KEY` (server secret), `VAPID_SUBJECT` (a `mailto:` contact). Live
in `.env.local` and Vercel (Production + Preview); documented name-only in
`.env.local.example`. Regenerate with `npx web-push generate-vapid-keys`. If any
is missing, push disables gracefully (no crash).

**Verification.** `scripts/verify-pwa.mjs` drives headless Chromium against a
`next start` server and checks: SW control, navigation, installability (Chrome's
own criteria; Lighthouse 13 removed the PWA category), the Cache Storage privacy
audit, the VAPID-signed send path, and SW push handling. On-device notification
*display* is not exercisable headless (no notification platform); confirm that
final step on a real device.

---

## 11. Today daily loop (Round 16)

Today runs an intelligent daily loop. All of it lives under `lib/daily/` and
renders on `app/dashboard/page.tsx`.

**Scheduling.** One hourly cron, `/api/cron/daily-loop` (CRON_SECRET Bearer, in
`vercel.json`), drives everything. It reads each user's local wall-clock from
`profiles.timezone` (backfilled from the `oria_tz` cookie, with `profiles.locale`,
via `syncLocaleTimezone` in `components/section/timezone-cookie.tsx`) and fires
what is due this local hour. No-timezone users fall back to UTC. `getLocalParts`
in `lib/utils/tz.ts` does the local-hour math.

**Routines** (`routines` table, `lib/daily/runner.ts`). Morning Briefing,
Weekly Review, Yesterday Recap, Pre-Meeting Prep, and custom. Defaults are
seeded per user in their primary space on first cron pass. Pre-Meeting Prep is
event-driven (`last_ref_id` guards against re-prepping the same meeting). Output
text is generated through the Conversation AI seam (`lib/daily/generate.ts`,
which imports `VOICE_RULES` from `lib/voice/oria-voice.ts`, see §6) and swept for
em-dashes via the shared `sweepEmDash` as a safety net. Delivered to Today +
generic push.

**Daily Journal** (`daily_journals`, unique per user/space/local-day). Written
at 21:00 local through the seam; the unique key makes the cron idempotent.

**Suggestions** (`lib/daily/suggestions.ts`, pure). Six grounded patterns:
expiring Trackable, untracked recurring bill, unfiled upload (only when a
section is inferable), stuck upload, calendar conflict, document-action-needed.
Each maps a real signal to a real Yes-write (`executeSuggestion` in
`lib/data/suggestion-actions.ts`, all RLS-scoped). No dismisses via
`dismissed_suggestions`; Comment is audit-logged. A seventh was deliberately not
shipped (no clean signal); grounded beats the round number.

**Roll-forward** (F6, `lib/daily/rollforward.ts`). Yesterday's unfinished
reminders are materialized as `rollover` rows in `today_pinned_cards` at the
local dawn. Idempotent two ways: the pure `computeRolloverCards` skips
already-carried ids, and a partial-unique index makes a duplicate insert a
no-op.

**Overcommitment** (F5, `lib/daily/overcommit.ts`). Heavy days surface an
actionable warning that blocks focus time (a real "Focus time" reminder) in the
largest open gap.

**Per-context surface** (F7, `lib/daily/context-surface.ts` +
`components/dashboard/context/`). One reusable `ContextChart` and one
`ContextTicker`, configured for Personal / Investor / Business / Family Office
(resolved from `kind` / `template_key` / `parent_kind`). Each leads with its own
real data; thin data shows a calm empty state, never fabricated numbers.

**Push payloads stay generic and are localized in code**
(`lib/daily/push-copy.ts`, keyed on `profiles.locale`) because the cron has no
request locale. In-app copy uses next-intl (`dailyLoop`, `suggestions`,
`contextSurface` namespaces, all four locales).

---

## 12. Pattern memory, privacy gate, Ask limit (Round 14.6)

**Pattern memory** (`user_patterns`, `lib/patterns/`). Per-user (pattern_type,
pattern_key) score, RLS own-rows. `recordPattern` reinforces (delta may be
negative); the first observation of a key is audit-logged (`pattern.learned`),
later reinforcements ride their already-audited source events. Two live
sources: suggestion accept/dismiss/comment (`suggestion_affinity`) and active
local hour on Ask (`active_hour`). `runPatternDecay` rides `/api/cron/daily-loop`
gated to 03:00 UTC (once/day), aging unreinforced patterns by a factor and
pruning below a floor (`decayStep`, pure + tested). Substrate for Round 20.

**Privacy before Connect** (F2). `components/settings/connect-privacy-gate.tsx`
intercepts the first Connect in the Connections hub with a what-we-do /
what-we-never-do step (from `docs/trust/messaging.md`, `connectPrivacy`
namespace). Acknowledgment persists in `profiles.connect_privacy_ack_at` (audit
`privacy.connect_acknowledged`); once set, Connect proceeds directly.

**Ask rate limit** (F3, `lib/ai/ask-limit.ts`). Per-user DAILY cap on Ask Oria
via `@upstash/ratelimit`, applied ONLY to Oria-default users; BYO-key users
(`userHasOwnProvider`) are exempt and never consume a token. Degrades OPEN if
Upstash is unconfigured. At the cap the route returns a localized message with
the reset window and a BYO nudge. Limit via `ORIA_ASK_DAILY_LIMIT` (default
100). This complements the in-process burst limiter (`lib/rate-limit.ts`) and
the DB daily quota that still guards the two Work-agent routes.

**Per-user-local dates** stay app-side (`getLocalParts`); no `user_local_date()`
Postgres function exists or is needed (no SQL path does tz-sensitive date math).

---

## 13. Accessibility, appearance, sidebar, voice input (Round 14.8)

**Accessibility floor.** WCAG AA is enforced, not aspirational. `scripts/verify-a11y.mjs`
drives Chromium against `next start`, injects axe-core (WCAG 2.0/2.1 A+AA), and
asserts zero critical/serious across six public routes plus three authenticated
dashboard routes (it mints a dev session from the Supabase keys; override identity
with `ORIA_A11Y_EMAIL`/`ORIA_A11Y_ORG`). Page errors are reported as warnings, not
gate failures. Current: 0 violations across 9 routes; Lighthouse a11y / = 100,
/login = 98. The dashboard has a skip-to-content link and a real `<main
id="main-content">` landmark (in `SidebarShell`). `--ink-faint` was darkened to
`#6e6557` so caption text clears 4.5:1 (the old `#9c9387` failed). The dark-mode
neutral ramp (faint/muted) still needs an AA retune that preserves hierarchy.

**Appearance prefs** (per user). Density (Comfortable/Compact, heuristics §1.14)
and font size (4 steps) live in `user_preferences` (migration 0073) AND mirror to
FOUC-free cookies (`oria_density`, `oria_font`) read by the dashboard layout.
`lib/appearance/prefs.ts` is the pure source (clamps + `--font-scale` map);
`setAppearance` (`lib/data/appearance-actions.ts`) persists + audits
(`settings.appearance.changed`). The type utilities multiply by `--font-scale`;
spacing-aware surfaces read `--density-*`. Control: `DisplayPanel` in Settings →
Appearance, applied optimistically to `#oria-shell`.

**Design primitives** (`components/ui/`): `Eyebrow`, `HeroNumber` (display type +
`tabular-nums`), `GlassCard` (glass + density-aware padding). `.living-bg` is the
fixed atmospheric layer (frozen under the blanket reduced-motion rule). Adopt the
primitives incrementally; they are live on the Today per-context surface.

**Single sidebar** (collapsed from the two-rail in a later side round). One rail
(`components/dashboard/sidebar.tsx`): logo at top, then the Home (Today) and Ask
primary actions, the Sections group, the mode-specific nav, the system tier, and
the account avatar (`UserMenu`) at the bottom. Space switching lives inside this
rail via `SpaceSwitcher` (with its create-space options); there is no second
rail and no `--rail-w`. Search is deduped: the top-bar command button + the body
command bar carry it, so the rail's Ask uses a chat glyph, not a magnifier.
Report-a-problem moved into the account menu (out of the rail). Drag-to-resize is
kept (a single rail still benefits from a user-set width for long section names).

**Voice input.** One reusable affordance, `components/ui/mic-button.tsx` (Whisper
via `/api/transcribe`): real `<button>`, aria-label/aria-pressed, polite
aria-live status, 44px target at md/lg, localized (`voice` namespace). State runs
through the pure `lib/voice/recording-machine.ts` (unit-tested). Wired on Ask, the
Work composer, the section text-log, the reminder title, and the upload inbox;
search + settings free-text are the documented long tail.

---

## 14. Onboarding conversation router + build moment (Round 14.9)

**Intent branching.** The onboarding conversation branches after Q1. The first
answer is classified by `lib/onboarding/intents.ts` (pure, tested) into an intent
(investor / family_office / founder / freelancer / job_seeker / student / parent /
renter / caregiver / teacher / traveler / personal). `question-bank.json` is
`{ intro, trees, reconfigure }`: the engine asks the intro question, then the
intent's tree, so different people get different questions. Every initial-setup
tree is the same length, so the progress count stays stable after the branch.

**Provisioning fills the surface choice.** `plan-executor.ts` no longer hardcodes
`template_key: "custom"`. It writes the real key via `resolveTemplateKey(template_id)`,
and an investor's personal org is keyed `"investor"` so the Round 16 per-context
surface resolver (`lib/daily/context-surface.ts`: office -> family_office,
template_key investor -> investor, parent_kind work -> business, else personal)
renders the right archetype. `intent` threads conversation -> UserContext ->
executeOnboardingPlan -> executeSetupPlan. Note: the resolver checks `kind==="office"`
before `parent_kind==="work"`, so work orgs (office kind) resolve to family_office,
not business; a true "business" surface needs a non-office work org. Flag, not fixed.

**Privacy-before-Connect** (Round 14.6) is placed at the onboarding Connect step:
`/onboarding/link` shows the what-we-do / what-we-never-do panel (`connectPrivacy`
namespace) before any connect prompt, recording the audited acknowledgment
(`acknowledgeConnectPrivacy`) on continue, then revealing the connectors.

**Build moment.** `lib/onboarding/callouts.ts` (pure, tested) pairs the plan's real
sections with the conversation's real fragments. The `BuildAnimation` runs ~12s and
assembles three of these callouts ("Adding {section}, because you mentioned {reason}",
`build_anim` namespace, four locales). prefers-reduced-motion derives the end state
in render (all callouts shown, no motion) and only schedules a quick finish; the
reduced-motion read uses `useSyncExternalStore` (no setState-in-effect).

---

## 15. Password reset (standalone round)

The recovery link must establish a session on the CLIENT before the set-password
form submits. Supabase delivers the recovery token in the URL hash (implicit
flow), which the server never sees, so `/auth/reset` is a client component
(`reset-client.tsx`) that consumes the token (hash `access_token`, or `?code` /
`?token_hash`) into a session, then calls `updateUser({ password })` against it,
audits via `recordPasswordReset` (`settings.password.changed`, via reset), and
lands the now signed-in user on `/dashboard`. Expired/used tokens show a
"request a new link" path.

The reset email is branded via Resend (heyoria.com), NOT Supabase SMTP:
`requestPasswordReset` mints the link with `admin.generateLink({ type: 'recovery' })`
and sends it with `lib/email/send-password-reset.ts`. The response is always
neutral ("if an account exists ...") and rate-limited with friendly copy. Every
auth button has a pending/disabled state (`components/auth/submit-button.tsx`
via useFormStatus for server-action forms; local state in the forgot/reset
clients). Proof without an inbox: `node scripts/verify-password-reset.mjs`
(temp user -> recovery OTP -> session -> updateUser -> new password signs in).

REQUIRED Supabase dashboard setting (Auth -> URL Configuration): the redirect
target `https://heyoria.com/auth/reset` (and the preview wildcard
`https://*.vercel.app/**`) must be in the Redirect URLs allow-list, or the verify
endpoint drops back to the Site URL instead of /auth/reset.

## 16. Multi-image groups understood as one set (standalone round)

A multi-image drop is NOT automatically one entity. When several images are
selected or dropped in one action, Oria decides whether they are one logical
thing (a flight: ticket + boarding pass + a bare flight-number screenshot) or
several distinct things (five unrelated receipts), then files accordingly.

**Grouping (slice 1).** Dropping >1 image in one action creates an
`upload_groups` row and stamps each `uploads.group_id` (migration 0074, also on
`extracted_entities` / `memory_items`). The single-file flow is unchanged.
Grouped uploads defer per-file extraction (`lib/data/upload-actions.ts` skips
the `upload.extract` job when `group_id` is set). The dropzone waits for the
whole action to settle, then fires one extraction; late files form a NEW group,
no retro-merge. Group completion is detected client-side in
`useUploadQueue` (`components/upload/upload-queue.tsx`): grouped uploads skip the
per-file poll (their status only flips as a side effect of the group read) and
`settleGroup` runs once the last upload of the set lands.

**Cross-image extraction (slice 2).** `lib/data/extract-upload-group.ts` claims
the group atomically (`pending` -> `extracting`, so the client trigger and the
cron fallback never double-run), downloads the images (cap 9; overflow is
re-queued per-file), and makes ONE multimodal Infra-AI call
(`lib/ai/extract-group.ts`, premium tier) that BOTH classifies one-vs-many AND
returns the record(s). The prompt prefers SEVERAL when unsure, so batch uploads
never regress into a blob. `sanitize` validates every enum and image index and
collapses "merged" to true only when exactly one record came back. Dual trigger:
the dropzone calls `finalizeUploadGroup` for snappiness; cron Phase E
(`/api/cron/process-uploads`) sweeps any group still pending past a 90s window.
AI failure falls back to per-image extraction (`group_id` cleared, jobs
re-enqueued). Audited `upload.group_extracted`.

**Review UI (slice 3).** A strip on the inbox (`components/upload/group-review.tsx`,
fed by `listReviewableGroups`) shows each finished group's thumbnails and
record(s), with Confirm plus a bidirectional correction: Keep separate (split a
wrongly-merged set: supersede the record, detach + re-queue each image) and
Combine into one (merge a wrongly-split set: supersede the records, re-read with
`force_merge` so the model returns one record). Actions live in
`lib/data/upload-group-actions.ts`, all org-scoped and audited
(`group_confirmed` / `group_split` / `group_merged`). Migration 0075 adds
`upload_groups.reviewed_at` (review state, NULL = needs review) and `force_merge`
(drives the merge re-read). Grouped uploads awaiting review are hidden from the
flat inbox list so a set shows as one card. Copy in en/ar/fr/es with ICU
plurals; the deterministic `force_merge` fold is unit-tested
(`group-extraction-sanitize.test.ts`); the live one-vs-many behavior is a manual
device gate.

---

End of brief. Update this file when a principle changes, not when code changes.
