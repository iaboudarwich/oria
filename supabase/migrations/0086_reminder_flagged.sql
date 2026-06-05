-- 0086_reminder_flagged.sql
-- Round A (saved views): a "flagged" bit on reminders so the Smart-List
-- "Flagged" view has something to surface. The view filters the existing flat
-- reminder model; it does not own or duplicate anything.
--
-- Schema-reality checked against the live DB (0085 applied): reminders has
-- id, organization_id, created_by, title, due_at, done, upload_id, created_at,
-- source, confirmed_at, visibility, assigned_to, notified_at,
-- notification_failed_at, lead_days, source_upload_id, auto_suggested, notes.
-- No flagged column. RLS already governs reminders (per-space membership).
--
-- Rollback: ALTER TABLE public.reminders DROP COLUMN flagged;

alter table public.reminders
  add column if not exists flagged boolean not null default false;

create index if not exists reminders_flagged_idx
  on public.reminders(organization_id) where flagged;
