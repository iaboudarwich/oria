-- Oria: optional short description on organizations.
-- Used to capture "what will you mostly share here" answers from the circle
-- creation wizard. Free-form text, optional. Future migrations may promote
-- this into a structured profile column (kinds, mode, etc.) similar to
-- custom_sections.profile.

alter table public.organizations
  add column if not exists description text;

notify pgrst, 'reload schema';
