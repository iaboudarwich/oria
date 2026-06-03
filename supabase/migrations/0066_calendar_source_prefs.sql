-- Round 14.5 F3: persist the calendar source filter per user.
--
-- Schema reality (verified): user_preferences exists with columns user_id,
-- response_length, formality, pinned_metrics, focus_areas, updated_at. No
-- calendar column yet. We add a single nullable jsonb holding the on/off state
-- of the three sources, e.g. {"events":true,"reminders":true,"bills":false}.
-- NULL means all sources on (the app default), so existing rows need no backfill.

alter table public.user_preferences
  add column if not exists calendar_sources jsonb;

-- Refresh PostgREST's schema cache so the new column is visible immediately.
notify pgrst, 'reload schema';
