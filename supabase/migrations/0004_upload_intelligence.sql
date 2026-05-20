-- Oria: upload intelligence schema.
-- Foundation for OCR + document understanding. The application currently
-- runs a stub classifier (see lib/data/upload-intelligence.ts); the same
-- schema receives richer output once a real OCR / vision pipeline is wired.

------------------------------------------------------------------------------
-- Document type
------------------------------------------------------------------------------
do $$ begin
  create type public.document_type as enum (
    'receipt',
    'invoice',
    'boarding_pass',
    'ticket',
    'contract',
    'itinerary',
    'schedule',
    'form',
    'handwritten_note',
    'sticky_note',
    'screenshot',
    'photo',
    'scanned_document',
    'business_card',
    'unknown'
  );
exception when duplicate_object then null; end $$;

------------------------------------------------------------------------------
-- Upload-level intelligence columns
-- These mirror the most useful fields from the latest extraction so list
-- views can read them without a join.
------------------------------------------------------------------------------
alter table public.uploads
  add column if not exists document_type public.document_type,
  add column if not exists language text,                 -- ISO 639-1
  add column if not exists is_handwritten boolean not null default false;

create index if not exists uploads_doctype_idx
  on public.uploads(organization_id, document_type);

------------------------------------------------------------------------------
-- Extractions
-- One row per processing pass. Multiple passes (re-OCR, re-classify) are
-- supported by inserting a new row rather than updating in place.
------------------------------------------------------------------------------
create table if not exists public.extractions (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references public.uploads(id) on delete cascade,
  document_type public.document_type,
  language text,
  secondary_languages text[] not null default '{}',
  is_handwritten boolean,
  script_hints text[] not null default '{}',
  raw_text text,
  -- Structured facts. Free-form to accommodate any document type:
  --   receipt:       { total, currency, merchant, date, items: [...] }
  --   boarding_pass: { airline, flight_no, from, to, departure, arrival, seat }
  --   contract:      { parties: [...], effective_date, expires_at, signatures }
  facts jsonb not null default '{}'::jsonb,
  -- Detected entities: { people: [...], organizations: [...], locations: [...] }
  entities jsonb not null default '{}'::jsonb,
  action_items text[] not null default '{}',
  confidence numeric,
  processor text not null,           -- e.g. 'stub-v1', 'gpt-4o-mini', 'gcv-doc'
  processed_at timestamptz not null default now()
);

create index if not exists extractions_upload_idx
  on public.extractions(upload_id, processed_at desc);

------------------------------------------------------------------------------
-- RLS: a member of the upload's org can read its extractions.
-- Inserts/updates come from the server (user session); same scope.
------------------------------------------------------------------------------
alter table public.extractions enable row level security;

drop policy if exists "extractions_read_org" on public.extractions;
create policy "extractions_read_org"
  on public.extractions for select
  using (
    exists (
      select 1 from public.uploads u
      where u.id = extractions.upload_id
        and public.is_org_member(u.organization_id)
    )
  );

drop policy if exists "extractions_insert_org" on public.extractions;
create policy "extractions_insert_org"
  on public.extractions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.uploads u
      where u.id = upload_id
        and public.is_org_member(u.organization_id)
    )
  );

drop policy if exists "extractions_update_org" on public.extractions;
create policy "extractions_update_org"
  on public.extractions for update
  using (
    exists (
      select 1 from public.uploads u
      where u.id = extractions.upload_id
        and public.is_org_member(u.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.uploads u
      where u.id = upload_id
        and public.is_org_member(u.organization_id)
    )
  );
