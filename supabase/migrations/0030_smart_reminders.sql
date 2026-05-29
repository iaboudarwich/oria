-- 0030_smart_reminders.sql
-- Adds lead_days, source_upload_id, auto_suggested to reminders.
-- Adds dismissed_suggestions table.
-- Updates send-reminders logic to honor lead_days (done in TS, not SQL).

alter table public.reminders
  add column if not exists lead_days        integer not null default 0,
  add column if not exists source_upload_id uuid    references public.uploads(id) on delete set null,
  add column if not exists auto_suggested   boolean not null default false;

-- dismissed_suggestions: prevents re-surfacing a suggestion the user said No to
create table if not exists public.dismissed_suggestions (
  user_id        uuid        not null references public.profiles(id) on delete cascade,
  suggestion_key text        not null,
  dismissed_at   timestamptz not null default now(),
  primary key (user_id, suggestion_key)
);

alter table public.dismissed_suggestions enable row level security;

create policy ds_rw on public.dismissed_suggestions
  for all using (user_id = auth.uid());

create index if not exists dismissed_suggestions_user_idx
  on public.dismissed_suggestions(user_id);
