-- Round U: optional notes on a reminder. One nullable column on the existing
-- reminders table (not a new reminder system); the detailed "Add reminder" form
-- writes it through the existing createReminder path and the agenda shows it
-- under the reminder title. Idempotent; safe to re-apply.
--
-- Rollback: alter table public.reminders drop column notes;

alter table public.reminders add column if not exists notes text;
