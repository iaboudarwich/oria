-- 0029_extracted_entities.sql
-- Structured field extraction from uploaded documents.
-- Two-step LLM pipeline (classify → extract) runs async after chunking.

------------------------------------------------------------------------------
-- 1. Add entity.extract kind to background_jobs constraint
------------------------------------------------------------------------------
alter table public.background_jobs
  drop constraint if exists background_jobs_kind_check;

alter table public.background_jobs
  add constraint background_jobs_kind_check
  check (kind in (
    'upload.extract',
    'report.generate',
    'reminder.propose',
    'analysis.compute',
    'entity.extract'
  ));

------------------------------------------------------------------------------
-- 2. extracted_entities — one row per upload, upserted on each run
------------------------------------------------------------------------------
create table if not exists public.extracted_entities (
  id                uuid        primary key default gen_random_uuid(),
  upload_id         uuid        not null references public.uploads(id) on delete cascade,
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  doc_type          text        not null,
  confidence        numeric     not null check (confidence between 0 and 1),
  fields            jsonb       not null,
  extracted_at      timestamptz not null default now(),
  extractor_version text        not null default 'v1',
  user_verified     boolean     not null default false,
  user_edited_fields jsonb,
  unique (upload_id)
);

alter table public.extracted_entities enable row level security;

-- Readers: any user who can see the source upload
create policy ee_read on public.extracted_entities
  for select using (
    exists (
      select 1 from public.uploads u
      where u.id = extracted_entities.upload_id
        and (
          u.uploaded_by = auth.uid()
          or (
            public.is_org_member(u.organization_id)
            and u.visibility <> 'private'
            and (
              public.my_access_level(u.organization_id) in ('owner', 'full')
              or (
                public.my_access_level(u.organization_id) = 'limited'
                and (
                  (u.visibility = 'circle'   and public.upload_in_my_sections(u.id))
                  or (u.visibility = 'specific' and public.upload_shared_with_me(u.id))
                )
              )
              or (
                public.my_access_level(u.organization_id) = 'assigned'
                and u.visibility = 'specific'
                and public.upload_shared_with_me(u.id)
              )
            )
          )
        )
    )
  );

-- Writers: only the uploader
create policy ee_write on public.extracted_entities
  for all using (
    exists (
      select 1 from public.uploads u
      where u.id = extracted_entities.upload_id
        and u.uploaded_by = auth.uid()
    )
  );

create index if not exists ee_org_type_idx
  on public.extracted_entities(organization_id, doc_type);

create index if not exists ee_fields_gin
  on public.extracted_entities using gin (fields);
