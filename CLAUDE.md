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

## 3. Operating principles (the 18)

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
fails the build on any em-dash and on item/entity/thing (and the per-locale
equivalents) in user-facing i18n copy. It does NOT ban "Records" or
"Trackables": those are the two legitimate canonical nouns. Records = the
people/vehicles/properties area; Trackables = the renewals feature.

---

## 6. Voice layer

All LLM output is shaped by the voice rules in `docs/voice/oria-voice.md`, applied through the AI seam (`app/api/ask/route.ts` + `lib/ai-providers/`). Read that doc before editing voice config.

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

**Icons.** Source is `public/logo.svg` (full lockup). `scripts/generate-icons.mjs`
(sharp) isolates just the disc emblem, drops the wordmark, centers it on the
`--canvas` field, and emits `public/icons/` (192, 512, 512-maskable with a ~10%
safe zone, apple-touch 180) plus `app/favicon.ico`. Re-run after a logo change.

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

End of brief. Update this file when a principle changes, not when code changes.
