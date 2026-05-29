-- Oria: reminder notification tracking.
-- Adds two nullable timestamp columns so the hourly cron can tell whether
-- a reminder has already been notified (skip) or had a failed attempt (log
-- without blocking the batch). Both nullable so existing rows are unaffected.

alter table public.reminders
  add column if not exists notified_at          timestamptz,
  add column if not exists notification_failed_at timestamptz;

-- Partial index covers the cron's WHERE clause exactly:
-- due reminders that haven't been notified yet, ordered by due date.
create index if not exists reminders_notify_idx
  on public.reminders(due_at)
  where done = false and notified_at is null;
