-- Oria: structured columns for the Diet and Bills smart sections.
--
-- memory_items already carries a flexible (merchant / amount / occurred_at /
-- location / category / raw_text / facts) shape. We add a few first-class
-- columns so SUM(calories) and "next recurring bill" queries are cheap and
-- don't depend on jsonb path scans:
--
--   • nutrition (calories + macros) — set when smart_section='diet'
--   • recurring pattern — set when Claude sees the bill is recurring
--   • smart_section — explicit routing for Diet vs Bills queries
--
-- Idempotent. Safe to re-run. Does not touch existing data.

alter table public.memory_items
  add column if not exists calories integer,
  add column if not exists protein_g numeric,
  add column if not exists carbs_g numeric,
  add column if not exists fat_g numeric,
  add column if not exists is_recurring boolean,
  add column if not exists recurring_interval text,
  add column if not exists smart_section text;

-- Speeds up the Diet and Bills page queries:
--   "show me today's meals" → org + smart_section='diet' + occurred_at desc
--   "next bill" → org + smart_section='bills' + occurred_at desc
create index if not exists memory_items_smart_section_idx
  on public.memory_items(organization_id, smart_section, occurred_at desc)
  where smart_section is not null;

-- For "which bills are recurring?" group-by queries.
create index if not exists memory_items_recurring_idx
  on public.memory_items(organization_id, smart_section, is_recurring)
  where is_recurring is true;

notify pgrst, 'reload schema';
