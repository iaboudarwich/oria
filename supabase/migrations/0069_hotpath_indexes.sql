-- Round 15 F5: hot-path indexes for the connection/file/calendar surfaces.
--
-- Schema reality (verified against the live DB on 2026-06-03, pg_indexes +
-- the foreign-key/index advisor):
--
--   calendar_events already has: pkey(id), unique(user_id, connection_id,
--     provider_event_id), (user_id, starts_at), (organization_id, section_key).
--   cloud_files already has: pkey(id), unique(user_id, connection_id,
--     provider_file_id), (user_id, organization_id), (organization_id,
--     section_key), hnsw(summary_embedding).
--
-- Two gaps confirmed on these hot tables:
--
--   1. The main calendar view (lib/data/calendar.ts) reads calendar_events
--      filtered by organization_id (IN orgIds) and ordered by starts_at, limit
--      500. The only org-leading index is (organization_id, section_key), which
--      serves the filter but forces a sort on starts_at. Add
--      (organization_id, starts_at) so the same index serves filter + order.
--
--   2. calendar_events.connection_id and cloud_files.connection_id are
--      unindexed foreign keys (ON DELETE CASCADE -> cloud_connections). When a
--      user disconnects a connector, the cascade currently sequential-scans
--      these tables. Index the referencing column so the cascade is a lookup.
--
-- Not indexed (deliberate): user_preferences.calendar_sources (jsonb, R14.5
-- F2) and organizations.theme_variant (R14.5 F4) are read via single-row
-- primary-key lookups (user_preferences PK = user_id; organizations PK = id),
-- which the existing primary keys already serve. No new index is warranted.
--
-- All indexes are additive and created IF NOT EXISTS. Rollback: drop the three
-- indexes below.

create index if not exists calendar_events_org_starts_idx
  on public.calendar_events (organization_id, starts_at);

create index if not exists calendar_events_connection_idx
  on public.calendar_events (connection_id);

create index if not exists cloud_files_connection_idx
  on public.cloud_files (connection_id);

notify pgrst, 'reload schema';
