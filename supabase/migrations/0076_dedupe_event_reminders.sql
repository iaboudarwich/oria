-- Bug fix: one ingested flight created TWO calendar entries (a "Suggested by
-- Oria" reminder and a "by Oria" memory_item event) for the same flight.
--
-- Event-shaped documents (boarding_pass, ticket, itinerary, schedule) already
-- appear on the calendar via memory_items.occurred_at, so the auto-created
-- "suggested" reminder at the same time is a pure duplicate. The eligibility
-- list (lib/ai/reminder-eligibility.ts) now excludes them going forward; this
-- migration collapses the duplicates already in the data and adds a guard so a
-- re-extraction cannot recreate them.
--
-- Rollback: drop index reminders_suggested_upload_due_uniq. (The deleted rows
-- were auto-generated duplicates of existing calendar events, not user data.)

-- 1. Collapse existing duplicates: a "suggested" reminder that mirrors an
--    event-shaped memory_item on the same upload duplicates that item's event.
delete from public.reminders r
using public.memory_items m
where r.source = 'suggested'
  and m.upload_id = r.upload_id
  and m.organization_id = r.organization_id
  and m.deleted_at is null
  and m.document_type in ('boarding_pass', 'ticket', 'itinerary', 'schedule');

-- 2. De-dup any remaining identical suggested reminders (same upload + time),
--    keeping the earliest, so the guard index below can be created cleanly.
delete from public.reminders r
using public.reminders keep
where r.source = 'suggested'
  and keep.source = 'suggested'
  and r.upload_id is not null
  and r.upload_id = keep.upload_id
  and r.due_at = keep.due_at
  and r.id <> keep.id
  and (keep.created_at < r.created_at
       or (keep.created_at = r.created_at and keep.id < r.id));

-- 3. Guard: at most one suggested reminder per (upload, due_at).
create unique index if not exists reminders_suggested_upload_due_uniq
  on public.reminders (upload_id, due_at)
  where source = 'suggested' and upload_id is not null;
