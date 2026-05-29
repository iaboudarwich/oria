-- 0032_vision_and_autocategorize.sql
-- Covers F5 (vision analysis) and F6 (auto-categorization).

------------------------------------------------------------------------------
-- 1. Add analyze_image and categorize_section to background_jobs constraint
------------------------------------------------------------------------------
alter table public.background_jobs
  drop constraint if exists background_jobs_kind_check;

alter table public.background_jobs
  add constraint background_jobs_kind_check
  check (kind in (
    'upload.extract',
    'report.generate',
    'reminder.propose',
    'analysis.compute',
    'entity.extract',
    'analyze_image',
    'categorize_section'
  ));

------------------------------------------------------------------------------
-- 2. New columns on uploads for auto-categorization (F6)
--    auto_section     — builtin section slug inferred by AI
--    auto_custom_section_id — custom section inferred by AI
--    section_assigned_by — 'user' (default) or 'auto'
------------------------------------------------------------------------------
alter table public.uploads
  add column if not exists auto_section            text,
  add column if not exists auto_custom_section_id  uuid
    references public.custom_sections(id) on delete set null,
  add column if not exists section_assigned_by     text
    check (section_assigned_by in ('user', 'auto'))
    not null default 'user';
