-- Multi-image uploads understood as one set.
--
-- A group links the images dropped together in one action so a single
-- multimodal extraction can decide one-entity-vs-many across the whole set
-- (a flight ticket + a bare flight-number screenshot -> one flight; five
-- unrelated receipts -> five records). The merged record(s) attach to the
-- group via group_id on extracted_entities / memory_items; a null group_id is
-- the unchanged solo path.
--
-- Schema-reality checked against the live dev DB: no group_id columns and no
-- upload_groups table existed; uploads.metadata jsonb is present.
--
-- Rollback:
--   alter table public.memory_items drop column group_id;
--   alter table public.extracted_entities drop column group_id;
--   alter table public.uploads drop column group_id;
--   drop table public.upload_groups;

create table public.upload_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  -- pending: awaiting the group extraction. extracting: claimed by a worker.
  -- merged: one record for the set. split: separate records per image.
  status text not null default 'pending'
    check (status in ('pending', 'extracting', 'merged', 'split')),
  created_at timestamptz not null default now()
);

alter table public.upload_groups enable row level security;
create policy "upload_groups_all_members" on public.upload_groups
  for all to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create index upload_groups_org_idx on public.upload_groups(organization_id, created_at desc);

alter table public.uploads
  add column group_id uuid references public.upload_groups(id) on delete set null;
create index uploads_group_idx on public.uploads(group_id) where group_id is not null;

alter table public.extracted_entities
  add column group_id uuid references public.upload_groups(id) on delete set null;
create index extracted_entities_group_idx on public.extracted_entities(group_id) where group_id is not null;

alter table public.memory_items
  add column group_id uuid references public.upload_groups(id) on delete set null;
create index memory_items_group_idx on public.memory_items(group_id) where group_id is not null;
