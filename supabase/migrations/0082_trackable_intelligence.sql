-- 0082_trackable_intelligence.sql
-- Round 18 Part 2: subscription / wishlist / goal trackables, a "won't do"
-- status for goals and wishlist items, and an exclude-from-insights flag.

-- Widen the category check to add wishlist + goal alongside the existing types.
ALTER TABLE public.trackables DROP CONSTRAINT IF EXISTS trackables_category_check;
ALTER TABLE public.trackables ADD CONSTRAINT trackables_category_check CHECK (category IN (
  'insurance', 'subscription', 'lease', 'membership',
  'certification', 'id_document', 'contract', 'warranty',
  'wishlist', 'goal', 'other'
));

-- Lifecycle status. "active" is the default; "wont_do" retires a goal or
-- wishlist item the user has decided against (kept, not deleted); "done"
-- marks it achieved or bought.
ALTER TABLE public.trackables
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'wont_do', 'done'));

-- Leaves a trackable out of spending insights (e.g. a one-off cost the user
-- does not want counted in recurring totals).
ALTER TABLE public.trackables
  ADD COLUMN IF NOT EXISTS exclude_from_insights boolean NOT NULL DEFAULT false;
