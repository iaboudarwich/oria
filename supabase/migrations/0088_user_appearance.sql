-- Per-user appearance: theme (dark/light/system) and accent (the brand
-- highlight: a preset key or a validated hex). These join density + font_size
-- on user_preferences as the durable, cross-device record; both are also
-- mirrored to FOUC-free cookies for the first server paint. Nullable so an
-- existing row keeps the app defaults (dark theme, mint accent) until the user
-- chooses. No RLS change: user_preferences is already own-row, written through
-- the service-role action keyed by user_id.

alter table public.user_preferences
  add column if not exists theme text
    check (theme in ('dark', 'light', 'system')),
  add column if not exists accent text;
