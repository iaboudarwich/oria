-- 0085_dashboard_cards.sql
-- Per-user Today daily-stats card layout (order + hidden), so the home reads as
-- a personalized dashboard the user controls. Stored on the existing per-user
-- user_preferences row (already RLS-scoped to the owner), as a small ordered
-- list of { key, hidden }. Defaults come from the per-archetype resolver; this
-- only records the user's overrides.
--
-- Schema-reality checked against the live DB (0084 applied): user_preferences
-- has user_id, response_length, formality, focus_areas, pinned_metrics,
-- updated_at, calendar_sources, density, font_size. No dashboard_cards column.
--
-- Rollback: ALTER TABLE public.user_preferences DROP COLUMN dashboard_cards;

alter table public.user_preferences
  add column if not exists dashboard_cards jsonb not null default '[]'::jsonb;
