# Round 15 F5: PII-scrub audit + hot-path indexes

Date: 2026-06-03. Scope: verify logs and Sentry never capture raw user content
(message bodies, document text, email addresses, secrets); scrub where needed;
add missing hot-path indexes.

## Sentry configuration (sentry.{client,server,edge}.config.ts)

Reviewed all three. Already well-scrubbed; no changes needed:

- `sendDefaultPii: false` in all three (no IP, user-agent, or email by default).
- Client session replay fully disabled (`replaysSessionSampleRate: 0`,
  `replaysOnErrorSampleRate: 0`) so DOM content / keystrokes are never captured.
- `beforeSend` deletes `event.request.data` (would carry uploaded file bytes or
  the full AI query + history), deletes `event.request.cookies`, strips URL
  query strings (signed-URL tokens, Supabase keys), redacts any `event.extra`
  string longer than 500 chars (possible leaked document text), and deletes
  `event.user`.
- `beforeBreadcrumb` drops `console` breadcrumbs entirely (they can carry logged
  document text) and strips fetch/xhr body sizes + URL query strings.
- `includeLocalVariables: false` (stack frames can't leak locals holding content).

## Analytics / breadcrumbs

- `lib/analytics.ts` (Vercel Analytics): no-ops outside production; props are
  typed structural metadata only. No PII. No change.
- `lib/breadcrumbs.ts`: a 10-entry, string-only ring buffer of short action
  labels ("Navigated to /dashboard/calendar"). Contract forbids document/query
  content. No change.

## Server logs (console.* -> Vercel runtime logs)

Swept all 20 `console.*` sites in `app/` + `lib/`. Most are tagged error logs
that interpolate an error name or a Supabase/infra error object (operational,
not user content). Two leaked raw user data and were scrubbed:

1. **`lib/extraction/service.ts`** logged the uploaded document **filename** on
   every failed extraction (a hot upload path). Filenames can reveal sensitive
   content (medical, legal, financial). Now redacted to the extension only via
   `redactFilename` (`tax_return_2023.pdf` -> `[file].pdf`).

2. **`lib/email/send-invite.ts`** logged the recipient **email address**
   (`to: input.toEmail`) to the runtime logs in two error paths. Email addresses
   are PII. Now masked via `maskEmail` (`jane@x.com` -> `j***@x.com`); the
   domain is kept for diagnostics (e.g. "from address not verified"). The
   sender (`from`) is Oria's own verified address, left as-is.

New helper: `lib/log/redact.ts` (`maskEmail`, `redactFilename`), unit-tested in
`tests/unit/log-redact.test.ts`.

Note: `recordSystemEvent` (the `system_events` table) stores the invite
recipient in its context. That is the product's own RLS-scoped DB, surfacing the
user's own invite in their status strip, not a shared log sink; left as-is.

Not changed (reviewed, judged safe): Supabase/PostgREST error objects logged in
`lib/embedding/*`, `lib/ai/retrieve.ts`, `lib/extraction/*`, `lib/cloud/*`,
`lib/cache/dedup.ts` are framework/DB errors (message/code/hint), not user
content.

## Hot-path indexes (migration 0069)

Schema-reality check against the live DB (pg_indexes + the unindexed-FK
advisor). On the connection/file/calendar hot tables, two gaps:

1. The main calendar view (`lib/data/calendar.ts`) filters `calendar_events` by
   `organization_id` (IN orgIds) and orders by `starts_at` (limit 500). The only
   org-leading index was `(organization_id, section_key)`, which forced a sort.
   Added `calendar_events (organization_id, starts_at)`.

2. `calendar_events.connection_id` and `cloud_files.connection_id` are unindexed
   foreign keys (`ON DELETE CASCADE` -> `cloud_connections`). A connector
   disconnect cascade-deleted via sequential scan. Added an index on each
   referencing column.

Deliberately **not** indexed: `user_preferences.calendar_sources` (jsonb) and
`organizations.theme_variant` are read via single-row primary-key lookups
(`user_preferences` PK = user_id; `organizations` PK = id), already served by
the primary keys. No index warranted.

Out of scope (flagged, not done): the advisor reports ~42 unindexed foreign keys
project-wide on colder tables (background_jobs, behavior_signals, invites,
entities, etc.) and unrelated RLS-initplan / multiple-permissive-policy notices.
F5 was scoped to the connection/file/calendar hot paths; a broader FK-index and
RLS-policy sweep is left for a dedicated DB-hardening round to avoid index bloat
on cold tables.
