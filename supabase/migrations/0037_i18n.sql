-- 0037_i18n.sql
-- Per-account UI language and per-workspace content language.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en'
    CHECK (preferred_language IN ('en', 'ar', 'fr', 'es'));

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS content_language text NOT NULL DEFAULT 'en'
    CHECK (content_language IN ('en', 'ar', 'fr', 'es'));
