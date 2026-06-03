-- Round 13 F5: retire the abstract template_key values.
--
-- Schema reality (verified before writing): organizations.template_key was
-- added in 0033 with an inline CHECK allowing
-- ('personal','investor','business','family_office','custom'). Live values are
-- only 'custom', 'personal', and NULL; no business/family_office/investor rows
-- exist. The column constraint is named organizations_template_key_check.
--
-- The abstract category values ('personal','business','family_office') are
-- retired. 'investor' and 'custom' are preserved, and the constraint is widened
-- to the real-life onboarding template ids (lib/onboarding/templates.ts) plus
-- 'custom'. NULL still passes the CHECK and is left untouched. Theming and the
-- Things label are now driven by the space's accent and area, not this key, so
-- the stored value is effectively vestigial (kept for forward-compat).
--
-- Note: the catalog id for the travel template is 'traveler' (its display name
-- is "Frequent Traveler"); the constraint uses the real catalog ids.

-- Step 1: backfill the retired abstract values to 'custom', auditing each row.
with backfilled as (
  update public.organizations
  set template_key = 'custom'
  where template_key in ('personal', 'business', 'family_office')
  returning id, created_by
)
insert into public.audit_log (user_id, organization_id, action, resource_type, resource_id, metadata)
select created_by, id, 'setup_template_retired', 'organization', id,
       jsonb_build_object('retired_to', 'custom')
from backfilled;

-- Step 2: drop the old abstract constraint.
alter table public.organizations
  drop constraint if exists organizations_template_key_check;

-- Step 3: add the real-life template set + 'custom'. NULL still allowed.
alter table public.organizations
  add constraint organizations_template_key_check
  check (template_key in (
    'renter', 'homeowner', 'parent', 'freelancer', 'traveler',
    'teacher', 'caregiver', 'investor', 'custom'
  ));

-- Refresh PostgREST's schema cache.
notify pgrst, 'reload schema';
