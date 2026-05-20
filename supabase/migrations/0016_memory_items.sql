-- Oria: memory_items.
--
-- One row per discrete piece of information Oria detected. A single uploaded
-- image often carries more than one receipt or document on it, and the user
-- should be able to ask about each one independently ("How much did I spend
-- at Spinneys?", "Find the Hermès invoice"). Items always link back to their
-- source upload but each carry their own classification + structured fields.
--
-- The existing `extractions` table stays as-is: it captures the per-pass
-- model output for the file as a whole (the audit trail). `memory_items` is
-- the *queryable* layer Ask Oria reads from.
--
-- Idempotent. Safe to re-run.

create table if not exists public.memory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete cascade,

  -- Classification
  document_type public.document_type,
  section public.section,
  custom_section_id uuid references public.custom_sections(id) on delete set null,
  language text,
  is_handwritten boolean,
  confidence numeric,

  -- Display
  title text not null,
  summary text,

  -- Structured fields for receipts / invoices / payments. All nullable;
  -- non-financial items just leave them null.
  merchant text,
  amount_value text,          -- preserves the original notation: "184.32", "1 250,00"
  amount_currency text,       -- ISO when possible: "USD", "EUR", "LBP"
  amount_normalized numeric,  -- best-effort numeric for SUM queries
  occurred_at timestamptz,    -- when the transaction/event actually happened
  location text,
  payment_method text,
  category text,
  items_purchased text[],

  -- Full extracted text for this single item (not the whole image)
  raw_text text,

  -- Catch-all for additional structure we don't want to schema yet
  entities jsonb not null default '{}'::jsonb,
  facts jsonb not null default '{}'::jsonb,

  -- Soft delete, mirrors uploads' behaviour
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for the common query patterns.
create index if not exists memory_items_org_occurred_idx
  on public.memory_items(organization_id, occurred_at desc);
create index if not exists memory_items_org_created_idx
  on public.memory_items(organization_id, created_at desc);
create index if not exists memory_items_upload_idx
  on public.memory_items(upload_id);
create index if not exists memory_items_merchant_idx
  on public.memory_items(organization_id, lower(merchant))
  where merchant is not null;
create index if not exists memory_items_section_idx
  on public.memory_items(organization_id, section)
  where section is not null;
create index if not exists memory_items_custom_section_idx
  on public.memory_items(organization_id, custom_section_id)
  where custom_section_id is not null;

-- Keep updated_at fresh on UPDATE.
drop trigger if exists memory_items_touch on public.memory_items;
create trigger memory_items_touch before update on public.memory_items
  for each row execute function public.touch_updated_at();

alter table public.memory_items enable row level security;

-- Read: section-aware. Owners + full members see everything in the org;
-- limited members only see items in sections they've been granted; assigned-
-- only members don't see items by default (item-level sharing comes later).
drop policy if exists "memory_items_read" on public.memory_items;
create policy "memory_items_read"
  on public.memory_items for select
  using (
    deleted_at is null
    and public.is_org_member(organization_id)
    and (
      public.my_access_level(organization_id) in ('owner', 'full')
      or (
        public.my_access_level(organization_id) = 'limited'
        and (
          (section is not null and exists (
            select 1 from public.membership_sections ms
            join public.memberships m on m.id = ms.membership_id
            where m.organization_id = memory_items.organization_id
              and m.user_id = auth.uid()
              and ms.builtin_section = memory_items.section
          ))
          or (custom_section_id is not null and exists (
            select 1 from public.membership_sections ms
            join public.memberships m on m.id = ms.membership_id
            where m.organization_id = memory_items.organization_id
              and m.user_id = auth.uid()
              and ms.custom_section_id = memory_items.custom_section_id
          ))
        )
      )
    )
  );

-- Write/update/delete: only members of the org. Service role bypasses RLS
-- anyway, which is how the upload pipeline inserts.
drop policy if exists "memory_items_insert" on public.memory_items;
create policy "memory_items_insert"
  on public.memory_items for insert
  to authenticated
  with check (public.is_org_member(organization_id));

drop policy if exists "memory_items_update" on public.memory_items;
create policy "memory_items_update"
  on public.memory_items for update
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "memory_items_delete" on public.memory_items;
create policy "memory_items_delete"
  on public.memory_items for delete
  using (public.is_org_member(organization_id));

notify pgrst, 'reload schema';
