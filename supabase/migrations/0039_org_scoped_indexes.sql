-- 0039_org_scoped_indexes.sql
-- Org-scoped read indexes flagged by the May 2026 cleanup audit
-- (docs/audits/cleanup-2026-05.md §10.1). Every column below is filtered
-- on by lib/data/*.ts via `.eq("organization_id", …)` but lacks a
-- supporting index today — Postgres does not auto-index foreign-key
-- referencing columns, so those queries fall back to sequential scans
-- as orgs accumulate rows.
--
-- Pattern matches 0023_perf_indexes.sql: plain `create index if not
-- exists` (no `concurrently` — Supabase migrations run inside
-- transactions). Idempotent; safe to re-run.

-- Sidebar build: list custom sections per active org on every dashboard
-- page load. With 100+ sections per org this is the heaviest read on
-- the chrome.
create index if not exists custom_sections_org_idx
  on public.custom_sections(organization_id);

-- Sidebar order + visibility: section_settings is read alongside the
-- custom_sections list, joined by org + section reference. The
-- composite index covers both filters in one lookup.
create index if not exists section_settings_org_idx
  on public.section_settings(organization_id, builtin_section);

-- Circle / office member lists, invite acceptance lookups, scope guard
-- checks (listMemberSectionRefs). Membership tables grow with every
-- invite accepted.
create index if not exists memberships_org_idx
  on public.memberships(organization_id);

-- Calendar + "what's coming up" rollups + the cron sender all query
-- reminders by org and order by due date. The composite covers the
-- filter and the sort in one B-tree scan.
create index if not exists reminders_org_due_idx
  on public.reminders(organization_id, due_at desc);

-- Semantic search org-scoping: every match_document_chunks RPC call
-- filters chunks by the caller's org before the pgvector HNSW lookup
-- ranks results. Without an org index that filter is a seq scan over
-- every chunk in the database.
create index if not exists document_chunks_org_idx
  on public.document_chunks(organization_id);

notify pgrst, 'reload schema';
