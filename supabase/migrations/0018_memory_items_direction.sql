-- Oria: cash-flow direction on memory_items.
--
-- A single column that distinguishes money-in from money-out so the
-- Analysis page can render real revenue-vs-expense charts. Nullable; the
-- extractor sets it only when the document clearly indicates direction.
--
--   • 'outflow' — money the user paid or owes (bills, invoices received,
--                 receipts of purchases, outgoing transfers)
--   • 'inflow'  — money the user received (sales invoices, customer
--                 receipts, incoming transfers, refunds)
--   • null      — non-financial items, or ambiguous documents
--
-- Idempotent. Safe to re-run. Does not touch existing data.

alter table public.memory_items
  add column if not exists direction text;

do $$ begin
  alter table public.memory_items
    add constraint memory_items_direction_check
    check (direction in ('inflow', 'outflow') or direction is null);
exception when duplicate_object then null; end $$;

-- Speeds up Analysis page aggregations: org + direction + month-of-occurred.
create index if not exists memory_items_org_direction_idx
  on public.memory_items(organization_id, direction, occurred_at desc)
  where direction is not null;

notify pgrst, 'reload schema';
