# Oria - Complete State of the Project (as of Round 14, June 2026)

A single read-once-and-understand-everything handoff for an engineer (or another
Claude instance) picking up Oria cold. Exact file paths, table names, migration
numbers, and env vars throughout.

---

## 1. Product overview

**Oria is a personal and small-business "second brain" for documents and life
admin.** You upload anything (PDFs, receipts, screenshots, photos, voice notes)
or connect your email/calendar/cloud; Oria extracts the meaning, files each item
into the right section, remembers the facts (dates, amounts, vendors, people),
and answers questions in natural language ("when did I last pay electricity?",
"what flights do I have?"). The thesis: most people's important information is
scattered across inboxes, drives, and paper; Oria centralizes and _understands_
it without forcing the user to organize anything manually.

**End-to-end UX:**

- **Signup** (`/signup`): email + password (Supabase Auth), email verification.
- **Onboarding** (`/onboarding/demo` -> `/conversation` -> `/preview` -> `/link` -> reveal): a 30s demo, a short adaptive conversation that distils a `UserContext`, an AI-tailored plan shown in a premium build animation, a connectors step, and a one-time reveal of the built dashboard.
- **Daily use**: upload or forward email; items auto-file into sections (Bills, Health, Travel, etc.); browse sections, the Calendar, Items (entities), and Trackables; ask Oria anything (text or image, with optional deeper reasoning).
- **Reshape** (`/dashboard/reshape`): restructure Oria by talking to it ("add a coaching space", "delete the kids section", "rename Travel to Adventures"); 24-hour undo.

**Spaces model:** every user has a Personal space and can have Work spaces
(offices) and Circles (shared). Each is an `organizations` row; the active space
is held in a cookie. Sections live inside a space.

---

## 2. Architecture

- **Next.js 16 App Router** (the main app; this repo). Server Components by default, Server Actions for mutations, Route Handlers for streaming/cron/OAuth. Deployed on **Vercel** (production `heyoria.com`, project `prj_dTpSCC3LlgcL29rJ09weE7il9c5W`, team `team_FT0l5vnhdclt2BA0ji7iQdor`).
- **Supabase** (Postgres + Auth + Storage + RLS). Project ref `kygbucpsgconskpxqlmk` ("oria-dev", the live DB). Row-level security on every user table. Storage buckets hold uploaded originals (encrypted).
- **Python sidecar** (deployed on **Railway**): heavy document extraction (docling/OCR, HEIC handling assist, embeddings). The Next app calls it over HTTP with an HMAC-signed header (`lib/google/shared/sidecar-auth.ts`); the sidecar also runs cloud-file ingestion.
- **Cloudflare**: DNS / edge in front of the domain.
- **AI providers**: Anthropic (Oria's own infrastructure key) for all infrastructure AI; the user's own Anthropic/OpenAI/Gemini key (BYO) can power conversation surfaces.

**Data flow (upload):** client uploads -> Supabase Storage + `uploads` row ->
`process-uploads` cron / queue -> sidecar extracts text -> `lib/ai` classifies
section + extracts `memory_items` (facts, dates, amounts) + chunks for retrieval
(`document_chunks`) -> items surface in sections, Calendar, Items, and Ask.

**Data flow (Ask):** `/api/ask` (NDJSON stream) -> retrieval (`lib/ai/retrieve.ts`,
vector + keyword over `document_chunks`/`memory_items`) + two cheap classifiers
(reasoning, setup-intent) run in parallel -> `streamAnswer` (`lib/ai/agent.ts`)
streams the answer via the user's provider or Oria's, with citations.

---

## 3. Database schema (migrations 0001-0065)

65 migrations applied (0001-0065). No 0066 (Round 14 needed none). Each migration
file is in `supabase/migrations/`. Highlights by number:

- **0001 init** - core tables: `profiles`, `organizations`, `memberships`, `uploads`.
- 0002 upload views; 0003 circles + invites; 0004 upload_intelligence; 0005 resume type; 0006 custom_sections + reminder source; 0007 section_profile; 0008 section_settings; 0009 sync custom sections; **0010 soft_delete** (added `deleted_at`+`deleted_by` to **uploads only** - a Round 13/14 gotcha: it did NOT add deleted_at to organizations or custom_sections).
- 0011 org description; 0012 access levels; 0013-0014 invite v2 + lookup; 0015 adaptive context; **0016 memory_items** (the fact store); 0017 smart_sections; 0018 memory direction; 0019 section memories; 0020 workspace_ai; 0021 system_events; 0022 background_jobs; **0023 perf_indexes**; **0024 document_chunks** (RAG); 0025 section-scoped chunks; 0026 reminder_notifications; **0027 conversations**; 0028 onboarding; 0029 extracted_entities; 0030 smart_reminders; 0031 cross_org_search; 0032 vision + autocategorize; **0033 workspace_templates** (added `organizations.template_key` with a CHECK).
- 0034 scoped memberships; **0035 entities** + 0036 trackables (the Items/entities + Trackables features); **0037 i18n** (`content_language`); 0038 guided onboarding; 0039 org-scoped indexes; **0040 mfa**; **0041 audit_log**; 0042 storage RLS align; 0043 beta disclaimer; 0044 section customization; **0045 work_architecture** (`parent_kind`, `is_default_for_kind`); **0046 space_theme** (`accent_color`, `shadow_color`); **0047 user_profile** (preferences/derived).
- **0048 email_connections** -> 0049 email_scan -> 0050 appointment type -> 0051 section routing -> 0052 connection filters -> 0053 learned routing rules -> 0054 connection routing (the Gmail/email pipeline, Rounds 8-9).
- **0055 onboarding_setup_plans** (the reshape/undo store). **0056 cloud_connections** + 0057 cloud_files + 0058 match_cloud_files + **0059 calendar_events** + 0060 microsoft_provider (Google/Microsoft cloud + calendar, Round 9).
- **0061 user_ai_connections** + 0062 ai_fallback_notice + **0063 reasoning_mode** (BYO AI + reasoning tier, Rounds 10-11).
- **0064 org_soft_delete** (added `deleted_at` to `organizations` AND `custom_sections` + partial indexes - Round 12, the migration that corrected 0010's gap).
- **0065 template_key_refactor** (Round 13: backfilled abstract `template_key` values to `custom`, new CHECK = real-life template ids + `custom`).

**Key tables and columns (current):**

- `profiles`: id (=auth user), email, `has_completed_guided_onboarding`, `onboarding_completed_at`, `mfa_enrolled_at`, `reasoning_mode`, preferences/derived (JSON), `content_language`.
- `organizations`: id, slug, name, kind (`personal|office|circle`), `parent_kind` (`personal|work`), `is_default_for_kind`, description, `template_key` (real-life ids + `custom` + null), `accent_color`, `shadow_color`, `things_label`, `deleted_at`, created_by.
- `memberships`: organization_id, user_id, role (`owner|...`), access level.
- `uploads`: org, storage path, filename, title, section, `custom_section_id`, `deleted_at`, `deleted_by`, occurred metadata.
- `custom_sections`: organization_id, name, icon, created_by, `deleted_at` (0064).
- `section_settings`: per-org builtin/custom section visibility + sort + custom label.
- `memory_items`: the fact store - org, upload_id, title, `occurred_at`, `section`, `smart_section` (`diet|bills|null`), merchant, amount_value/currency, location, summary, document_type, is_recurring, direction, `deleted_at`. Drives Calendar, Bills, Diet, insights.
- `document_chunks`: RAG chunks (embedding vector, 384-dim store fed by the sidecar), section-scoped.
- `reminders`: org, title, `due_at`, source; `reminder_notifications` tracks sends.
- `entities` + `entity_types`: the Items area (people, vehicles, properties, funds, etc.) - per-type field schemas.
- `email_connections`: provider (`gmail|outlook`), email, status, routing_mode, routing_target_org_ids, filters, last_synced_at, last_error.
- `cloud_connections`: provider (`google|microsoft`), service (`calendar|drive|onedrive|outlook_calendar`), account_email, status, routing.
- `cloud_files`, `calendar_events`: synced cloud file index + calendar events.
- `onboarding_setup_plans`: stores `{patch, created_org_ids}` or legacy `{spaces}` for reshape + 24h undo; `executed_at`, `reverted_at`, `source`.
- `user_ai_connections`: BYO provider key (encrypted), validation status.
- `conversations` + messages: Ask Oria history.
- `audit_log`: user_id, organization_id, action (free text), resource_type/id, ip_address, user_agent, metadata (jsonb), created_at. RLS: own rows only.
- `system_events`, `background_jobs`, `learned_routing_rules`, `trackables`.

**RLS:** every user-facing table restricts to the actor's memberships / own
rows. Storage RLS aligned in 0042 (audited in Round 12, `scripts/audit-storage-rls.ts`).

---

## 4. Codebase map

- `app/` - routes. `app/dashboard/*` (the product: sections, calendar, things [Items], inbox [Uploads], bills, diet, work/_, settings, reshape, ask), `app/onboarding/_`(demo, conversation, preview, link),`app/api/_` (ask, cron/_, OAuth callbacks), `app/(marketing)/*`, `app/login`, `app/signup`, `app/security` (responsible disclosure), `app/privacy`, `app/terms`.
- `lib/` - `lib/ai/*` (agent, retrieve, classifiers, extract, suggested-questions, ask-images), `lib/ai-providers/*` (the multi-provider abstraction: anthropic, openai, gemini adapters + model-map + errors + types), `lib/data/*` (data-layer reads/writes: organizations, calendar, smart-sections, things-label, space-theme, mode-actions, workspace-templates, audit-log, conversations, user-profile, ...), `lib/onboarding/*` (conversation-engine, templates, template-generator, plan-executor, reshape-plan, types), `lib/integrations/gmail/*`, `lib/google/*`, `lib/microsoft/*`, `lib/cloud/shared/*`, `lib/supabase/*` (server/admin/types), `lib/sections-meta.ts`, `lib/sections/routing.ts`, `lib/rate-limit.ts`, `lib/analytics.ts`.
- `components/` - `components/dashboard/*` (sidebar, topbar, space-switcher, user-menu), `components/sections/*` (section-view-tabs, trips-view, health-timeline-view, bills-spend-view), `components/calendar/*`, `components/ask/*` (ask-chat), `components/onboarding/*` (patch-preview, build-animation, onboarding-reveal), `components/settings/*` (one panel per concern), `components/connections/*`, `components/command/command-palette.tsx`, `components/ui/*` (icon, button, toast, theme-toggle, mic-button).
- `messages/{en,ar,fr,es}.json` - i18n (next-intl), key parity enforced.
- `supabase/migrations/*.sql` - 0001-0065.
- `tests/unit/*` - 18 files, 200 tests (Vitest).
- `docs/audits/round-N-*.md` - per-round audit docs; `docs/perf/2026-06-baseline.md`.

---

## 5. Features by round (1-14)

- **R1-5 (foundation)**: auth, spaces, upload + storage, upload intelligence, custom sections, soft delete, memory_items fact store, smart sections, document_chunks RAG, conversations, vision + autocategorize, workspace templates.
- **R6**: command palette (Cmd+K), feature index, one-time tour, sidebar hierarchy.
- **R7**: conversational onboarding engine + real-life templates + plan executor; reshape reconfigure mode (additive).
- **R8**: Gmail email scan pipeline, per-email routing, hourly cron infrastructure (`/api/cron/send-reminders`).
- **R9**: Google + Microsoft cloud (Calendar/Drive/OneDrive), multi-service hubs, calendar_events.
- **R10**: multi-provider AI abstraction (Anthropic/OpenAI/Gemini), streamConversation with silent fallback.
- **R11**: reasoning tier + reasoning classifier + "think harder"; vision parity (tools+images in the abstraction).
- **R12**: reshape DELETE/RENAME with soft-delete cascade (migration 0064), Ask setup-intent classifier + auto-route, 24h undo for destructive ops, image upload UI for Ask (multimodal), storage RLS audit.
- **R13**: invisible templates, premium build animation (`components/onboarding/build-animation.tsx` + `useBuildGate`), Gemini vision parity (`inlineData`), setup-intent on image queries, abstract `template_key` retirement (migration 0065).
- **R14 (this round, Polish)**: Settings reorder + clarity + Reshape prominence; section default tabs (Travel->Trips, Health->Timeline); naming (Inbox->Uploads, Things->Items); Diet folded into Health; calendar excludes diet log entries. Connections hub redesign deferred. Key files touched: `app/dashboard/settings/page.tsx`, `components/settings/preferences-panel.tsx`, `components/dashboard/sidebar.tsx`, `app/dashboard/sections/[section]/page.tsx`, `lib/data/things-label.ts`, `lib/data/workspace-templates.ts`, `app/dashboard/layout.tsx`, `lib/data/calendar.ts`.

---

## 6. Integrations and connectors

| Service                             | Use                                                             | Env vars                                                                               | Status                               |
| ----------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------ |
| Anthropic                           | Oria's infrastructure AI (extraction, classifiers, default Ask) | `ANTHROPIC_API_KEY`                                                                    | live                                 |
| OpenAI                              | BYO conversation provider                                       | user key (encrypted in `user_ai_connections`)                                          | live                                 |
| Gemini                              | BYO conversation provider (vision since R13)                    | user key                                                                               | live                                 |
| Supabase                            | DB/Auth/Storage                                                 | `NEXT_PUBLIC_SUPABASE_URL`, anon/service keys                                          | live                                 |
| Google Cloud (Gmail/Calendar/Drive) | OAuth connectors                                                | Google OAuth client id/secret + 3 env vars (per memory: needs creds + Railway sidecar) | live, OAuth verification pending     |
| Microsoft Graph (Outlook/OneDrive)  | OAuth connectors                                                | MS client id/secret                                                                    | live, publisher verification pending |
| Railway                             | Python sidecar host                                             | sidecar URL + HMAC secret                                                              | live                                 |
| Vercel                              | app hosting + cron                                              | project/team ids in memory                                                             | live                                 |
| Resend                              | transactional email (reminders, verify)                         | `RESEND_*`                                                                             | live (skips if unconfigured)         |
| Sentry                              | error tracking                                                  | `SENTRY_*`                                                                             | live                                 |
| Upstash                             | rate limiting                                                   | `UPSTASH_*` (or in-memory fallback)                                                    | live                                 |
| Cloudflare                          | DNS/edge                                                        | n/a                                                                                    | live                                 |

`CRON_SECRET` guards all `/api/cron/*` routes.

---

## 7. AI architecture

- **Abstraction** (`lib/ai-providers/`): `ProviderAdapter` interface (complete, streamComplete, embed, validateKey). Adapters: `anthropic.ts`, `openai.ts`, `gemini.ts`. `model-map.ts` maps Oria tiers (`premium|fast|reasoning`) to each provider's models (e.g. Anthropic premium/fast/reasoning; Gemini 1.5-pro/1.5-flash/2.0-flash-thinking-exp). `getProvider(userId, queryType)`: `infrastructure` -> always Oria's Anthropic; `conversation` -> user's BYO key if active, else Oria's, with silent fallback.
- **Content model** (`types.ts`): `Message.content` is `string | ContentPart[]`; `ContentPart` is text or `{type:"image", mimeType, dataBase64}` (vision across all three providers).
- **Cheap classifiers** (`lib/ai/classifiers/base.ts` `runFastJsonClassifier`): `classifyReasoningIntent` (analytical?) and `classifySetupIntent` (setup change?). Both fast-tier, JSON mode, never throw, run in the Ask `Promise.all`.
- **Ask** (`lib/ai/agent.ts` `streamAnswer`): builds system + sources + the user turn (multimodal when images attached), streams via `streamConversation`. Base answer is fast tier; reasoning tier on demand (`reasoning_mode`: auto/manual/always/never).
- **Setup-intent reroute**: `/api/ask` emits a `setup_intent` event (with `hasImage`) when a setup change is detected at confidence > 0.75; the client renders the reshape preview inline.

---

## 8. Onboarding flow

Screens: `/onboarding/demo` (3 auto-advancing slides) -> `/onboarding/conversation`
(adaptive Q&A via `lib/onboarding/conversation-engine.ts`, questions reworded by
Haiku, answers synthesized into a `UserContext`) -> `/onboarding/preview` (the
hybrid generator `lib/onboarding/template-generator.ts` picks + tailors real-life
templates from `lib/onboarding/templates.ts` into a `SetupPlan`; shown editably;
the **premium build animation** plays during execution) -> `/onboarding/link`
(connectors grid) -> dashboard **reveal** (`components/onboarding/onboarding-reveal.tsx`,
one-time, gated on an initial_setup plan). Executor: `lib/onboarding/plan-executor.ts`
(`executeSetupPlan` additive; `executePlanPatch` for reshape). Real-life template
ids: renter, homeowner, parent, freelancer, traveler, teacher, caregiver, investor,
custom (internal selection metadata; never shown by name - R13).

---

## 9. Reshape engine

`PlanPatch` = `{creates: WorkspacePlan[], section_adds, renames: PatchRename[], deletes: PatchDelete[]}`.
Entry points: `/dashboard/reshape` page, Settings landing card (R14), sidebar
system cluster (R14), command palette, user menu, and Ask setup-intent auto-route.
Generation: `lib/onboarding/reshape-plan.ts` (`generateReshapePatch`, validates ids).
Execution: `executePlanPatch` (soft-delete via `deleted_at`, refuses deleting the
last personal space, audits `setup_change_executed`). **24h undo**: `undoSetupChange`
(removes created orgs, reverts renames, clears soft-deletes), within-24h-and-not-reverted
eligibility, surfaced in Settings -> Preferences "Recent Setup Changes". **Purge**:
`purgeExpiredSoftDeletes` in the hourly cron hard-deletes rows past 24h, audits
`setup_change_purged`. The build animation plays during reshape execution too (R13).

---

## 10. Settings and Connections

**Tabs (R14 order):** General, Connections, AI, Appearance, Preferences,
Sections, Circles, Workspaces, Storage, Security, Privacy
(`app/dashboard/settings/page.tsx` TABS). Reshape card on the General landing.

- **General**: modes, sidebar prefs (Timeline toggle - "Recent activity across the active space."), Theme (light/dark/system), Language, admin (admin only).
- **Connections**: `ConnectionsPanel` (Gmail hub), `CloudServicesPanel` (Google Calendar+Drive grouped by account), `MicrosoftServicesPanel` (Outlook mail/calendar + OneDrive). Status dots: active=sage, paused=ink-faint, error/revoked=claret. (Full hub redesign deferred - see round-14 report.)
- **AI**: BYO provider connection + reasoning mode.
- **Appearance**: per-space accent + shadow (writes to the active org only).
- **Preferences**: Response length ("How long Oria's answers run by default..."), Tone ("Whether Oria writes casually or more formally..."), Pinned metrics, Focus areas, learned rules, recent setup changes.
- **Storage**: quota, data export, retention. **Security**: 2FA (TOTP), sessions, audit activity. **Privacy**: data export, reset account, delete account.

---

## 11. Calendar, sections, items model

- **Sections**: builtin (`lib/sections-meta.ts`: household, travel, properties, staff, events, finance, legal, personal, vendors, health) + custom (`custom_sections`) + smart aggregations (`bills`; `diet` now folded under Health). Section detail at `app/dashboard/sections/[section]/page.tsx`; Travel/Health have intelligence tabs (Trips/Timeline) which are now the default (R14), Files secondary.
- **Calendar** (`lib/data/calendar.ts loadCalendar`): two sources - `reminders` with `due_at`, and `memory_items` with `occurred_at` (excluding `smart_section='diet'` since R14). Connector `calendar_events` feed section/home panels, not the main calendar view (a documented gap). Rich filter UI (kind/category/topic).
- **Items** (entities, route `/dashboard/things`, label "Items"/"Assets"): `entities` + `entity_types` with per-type field schemas.

---

## 12. Storage and quotas

Originals stored in Supabase Storage (RLS-scoped, encrypted at rest). Cloud files
are _referenced/indexed_ (`cloud_files`), not copied. Soft-deleted uploads sit in
Trash for 30 days then purge. Per-user storage quota + daily Ask request quota
(`lib/data/quotas.ts`). Reshape soft-deletes purge after 24h.

---

## 13. Privacy and security

AES-256-GCM encryption at rest (separate key); RLS everywhere; MFA (TOTP +
backup codes, migration 0040); sign-out-everywhere + re-auth gates; full deletion
(reset content vs delete account); self-serve audit log (`audit_log`, R12) with a
Settings activity feed; responsible-disclosure surface at `/security`; beta
disclaimer. Privacy page leads with a plain-language Q&A, full policy below.

---

## 14. Localization

Four languages: en, ar, fr, es (next-intl, `messages/*.json`). Key parity is
verified every round (Python keyset diff). Arabic is machine-translated with
placeholders/structure preserved; RTL is handled by next-intl locale direction.
A `lib/ai` regression test forbids U+2014 (em-dash) in prompts; the bar is held
everywhere. Note: several Settings panels remain hardcoded English (a known gap).

---

## 15. Performance

`getCurrentContext` is `React.cache()`-wrapped (per-request dedup). N+1 in
`countUploadsBySection` fixed (10 queries -> 1). Expensive work (summaries, AI
calls) runs parallel to the main fetch. Classifiers run in the Ask `Promise.all`.
Bundle: 22 runtime deps, no heavy dep added recently. **Lighthouse not yet run**
(dashboard is auth-gated; no browser in CI env) - the open perf task is a
signed-in maintainer Lighthouse pass; see `docs/perf/2026-06-baseline.md` (public
routes measured: edge TTFB ~0.22-0.29s).

---

## 16. Testing

Vitest, 18 files, **200 tests** passing. Coverage includes: AI prompt building +
em-dash regression, suggested questions, chunking, reminder eligibility, template
merge + stored-key resolution, things-label resolution, section scoping (incl.
soft-delete filter), personalization. Gates per commit: `npm run build`,
`npm test`, `npm run lint` (0 errors; 2 known pre-existing warnings in
`mfa-actions.ts` and `audit-storage-rls.ts`).

---

## 17. Deployment

Production `heyoria.com` on Vercel, auto-deploy on push to `main`. Migrations
applied to Supabase via `npx supabase db push` before the deploy lands. Commit
author must be `issamlife21@gmail.com` (the local-hostname email causes Vercel to
block the deploy). `.claude/settings.local.json` is local-only, kept out of
commits. Branch strategy: trunk-based on `main`.

---

## 18. Operational state

- Google OAuth: **verification pending** (works for test users; needs Google review for public scopes).
- Microsoft: **publisher verification pending**.
- Sidecar: deployed on Railway; needs the OAuth creds + 3 env vars + a redeploy to fully exercise Gmail/cloud live (per project memory).
- Cron (`vercel.json`): `process-uploads` (every minute), `send-reminders` (hourly, also runs the reshape 24h purge), `gmail-sync` (hourly), `drive-folder-sync` (hourly), `calendar-sync` (hourly), `ai-revalidate` (weekly Mon 04:00).

---

## 19. Known limitations and deferrals

- **Connections hub redesign (R14 F2)**: deferred - the single-page two-zone hub is a multi-component rebuild needing a live visual env to verify layout; doing it blind risked breaking connection flows.
- **Bills declutter + broad density rewrite (R14 F4/F5)**: deferred for the same reason.
- **Stricter calendar sourcing**: `calendar_events` (connector events) are not merged into the main calendar view; only the diet exclusion was applied this round.
- **Per-org theme variant (light/dark)**: deferred; theme stays global, per-org accent exists.
- **Gemini BYO image-attached queries**: now supported (R13) but not independently latency-measured.
- **Lighthouse / precise bundle metrics**: not run (no browser in env).
- **Several Settings panels hardcoded English** (preferences labels, sidebar labels): pre-existing i18n gap.
- **Diet meal-tracker page** kept as a dedicated page reached via the Health tab rather than rebuilt inline.

---

## 20. Roadmap remaining (before launch)

- Connections hub redesign (first item of a follow-up round).
- Bills/section density polish in a live visual environment.
- Maintainer Lighthouse pass + any resulting perf fixes; wire `calendar_events` into the calendar view if desired.
- Complete Google OAuth verification + Microsoft publisher verification; redeploy the sidecar with live creds.
- Finish localizing the remaining hardcoded-English Settings panels.
- PWA / installable app, invite flow hardening, and a final pre-launch smoke test of the full signup -> onboarding -> daily-use -> reshape chain.

---

_Generated at the end of Round 14. For per-round detail see `docs/audits/round-N-2026-06.md` (N = 7..14)._
