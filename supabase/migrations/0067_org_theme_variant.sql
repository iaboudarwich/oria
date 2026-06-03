-- Round 14.5 F4: per-org light/dark theme variant.
--
-- Schema reality (verified): organizations already has accent_color and
-- shadow_color (per-space accent). It has no theme variant column. We add a
-- nullable theme_variant; NULL means the space inherits the user's global
-- theme (next-themes). 'light'/'dark' force that variant for the space;
-- 'system' follows prefers-color-scheme. Accent is unaffected.

alter table public.organizations
  add column if not exists theme_variant text
  check (theme_variant is null or theme_variant in ('light', 'dark', 'system'));

-- Refresh PostgREST's schema cache so the new column is visible immediately.
notify pgrst, 'reload schema';
