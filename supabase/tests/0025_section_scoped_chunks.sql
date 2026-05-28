-- pgTAP regression test for 0025_section_scoped_chunks.sql
--
-- Verifies that a 'limited' member whose allowed section list contains only
-- section A receives zero chunks from uploads in section B when calling
-- match_document_chunks().
--
-- Run with:  supabase test db
--
-- All fixture data is inserted inside the transaction and rolled back at the
-- end, so this test is fully repeatable and leaves no side-effects.

begin;

select plan(4);

-- ── Fixtures ──────────────────────────────────────────────────────────────────

-- Owner user
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000001',
  'owner@test.invalid',
  'x',
  now(), now(), now()
);
insert into public.profiles (id, email) values ('00000000-0000-0000-0000-000000000001', 'owner@test.invalid');

-- Limited user
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000002',
  'limited@test.invalid',
  'x',
  now(), now(), now()
);
insert into public.profiles (id, email) values ('00000000-0000-0000-0000-000000000002', 'limited@test.invalid');

-- Organisation
insert into public.organizations (id, slug, name, created_by)
values ('00000000-0000-0000-0000-000000000010', 'test-org', 'Test Org', '00000000-0000-0000-0000-000000000001');

-- Owner membership
insert into public.memberships (id, organization_id, user_id, role, access_level)
values (
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'owner',
  'owner'
);

-- Limited membership (access_level = limited)
insert into public.memberships (id, organization_id, user_id, role, access_level)
values (
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000002',
  'assistant',
  'limited'
);

-- Grant the limited member access to section 'household' (section A) only.
-- Section 'finance' (section B) is intentionally NOT granted.
insert into public.membership_sections (membership_id, builtin_section)
values ('00000000-0000-0000-0000-000000000021', 'household');

-- Upload in section A (household) — circle visibility
insert into public.uploads (
  id, organization_id, uploaded_by, filename, content_type,
  storage_path, section, visibility, status
) values (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'household-doc.txt',
  'text/plain',
  'test/household-doc.txt',
  'household',
  'circle',
  'filed'
);

-- Upload in section B (finance) — circle visibility
insert into public.uploads (
  id, organization_id, uploaded_by, filename, content_type,
  storage_path, section, visibility, status
) values (
  '00000000-0000-0000-0000-000000000031',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'finance-doc.txt',
  'text/plain',
  'test/finance-doc.txt',
  'finance',
  'circle',
  'filed'
);

-- Chunk for section A upload — embedding of all-0.1 (arbitrary unit vector)
insert into public.document_chunks (
  id, upload_id, organization_id, chunk_index, content, embedding, metadata
) values (
  '00000000-0000-0000-0000-000000000040',
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000010',
  0,
  'household content',
  (select array_fill(0.05::float4, ARRAY[384])::vector(384)),
  '{"section": "household"}'
);

-- Chunk for section B upload
insert into public.document_chunks (
  id, upload_id, organization_id, chunk_index, content, embedding, metadata
) values (
  '00000000-0000-0000-0000-000000000041',
  '00000000-0000-0000-0000-000000000031',
  '00000000-0000-0000-0000-000000000010',
  0,
  'finance content',
  (select array_fill(0.05::float4, ARRAY[384])::vector(384)),
  '{"section": "finance"}'
);

-- ── Impersonate the limited user ──────────────────────────────────────────────
-- auth.uid() reads request.jwt.claims->>'sub' in Supabase's auth schema.
perform set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000002')::text,
  true  -- local to this transaction
);

-- ── Test 1: limited user gets ≥1 chunk from section A (household) ─────────────
select ok(
  (
    select count(*) > 0
    from public.match_document_chunks(
      (select array_fill(0.05::float4, ARRAY[384])::vector(384)),
      '00000000-0000-0000-0000-000000000010',
      10,
      0.0  -- very low threshold so our dummy vectors match
    )
    where metadata ->> 'section' = 'household'
  ),
  'limited user should see chunks from their allowed section (household)'
);

-- ── Test 2: limited user gets 0 chunks from section B (finance) ───────────────
select is(
  (
    select count(*)::int
    from public.match_document_chunks(
      (select array_fill(0.05::float4, ARRAY[384])::vector(384)),
      '00000000-0000-0000-0000-000000000010',
      10,
      0.0
    )
    where metadata ->> 'section' = 'finance'
  ),
  0,
  'limited user must see ZERO chunks from a section they have no access to (finance)'
);

-- ── Test 3: filter_section=finance returns 0 for limited user ─────────────────
select is(
  (
    select count(*)::int
    from public.match_document_chunks(
      (select array_fill(0.05::float4, ARRAY[384])::vector(384)),
      '00000000-0000-0000-0000-000000000010',
      10,
      0.0,
      'finance'   -- explicit section filter
    )
  ),
  0,
  'limited user gets 0 results when filter_section=finance'
);

-- ── Test 4: owner user sees both sections ─────────────────────────────────────
perform set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001')::text,
  true
);

select ok(
  (
    select count(*) = 2
    from public.match_document_chunks(
      (select array_fill(0.05::float4, ARRAY[384])::vector(384)),
      '00000000-0000-0000-0000-000000000010',
      10,
      0.0
    )
  ),
  'owner user sees chunks from all sections'
);

select * from finish();

rollback;
