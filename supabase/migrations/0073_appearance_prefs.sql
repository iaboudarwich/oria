-- Round 14.8 F1: per-user appearance preferences.
--
-- Adds density (Comfortable/Compact, heuristics §1.14) and font_size
-- (user-adjustable text scale, accessibility floor) to user_preferences.
-- Both are mirrored to FOUC-free cookies by the server action so the root
-- layout can apply them on the first paint; this table is the durable,
-- cross-device source of truth and the audited record.
--
-- Schema-reality checked against the live dev DB (0072 applied): the table
-- had user_id, response_length, formality, focus_areas, pinned_metrics,
-- updated_at, calendar_sources. Neither column existed.
--
-- Rollback: ALTER TABLE public.user_preferences DROP COLUMN density, DROP COLUMN font_size;

alter table public.user_preferences
  add column if not exists density text not null default 'comfortable'
    check (density in ('comfortable', 'compact')),
  add column if not exists font_size text not null default 'default'
    check (font_size in ('small', 'default', 'large', 'xlarge'));
