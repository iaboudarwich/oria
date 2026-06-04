-- Round: multi-image uploads understood as one set (slice 3, review UI).
--
-- Two columns on upload_groups so a user can correct a wrong one-vs-many call:
--   reviewed_at  marks a group the user has acted on (confirmed/split/merged),
--                so it stops surfacing in the review strip. NULL = needs review.
--   force_merge  set when the user merges a wrongly-split group; the extractor
--                reads it and returns exactly one record on the re-run.
--
-- Rollback: alter table public.upload_groups
--             drop column if exists reviewed_at,
--             drop column if exists force_merge;

alter table public.upload_groups
  add column if not exists reviewed_at timestamptz,
  add column if not exists force_merge boolean not null default false;

-- Groups awaiting review are queried by (organization_id, reviewed_at is null);
-- a partial index keeps that strip query cheap as the table grows.
create index if not exists upload_groups_review_idx
  on public.upload_groups (organization_id)
  where reviewed_at is null;
