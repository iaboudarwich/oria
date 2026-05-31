-- 0043_beta_disclaimer.sql
-- Track who has acknowledged the beta disclaimer (shown once at first
-- sign-in). Null = never shown / never dismissed; a timestamp means
-- the user clicked "I understand". The dashboard layout reads this
-- flag and renders the modal exactly when it's needed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS beta_disclaimer_acknowledged_at timestamptz;

notify pgrst, 'reload schema';
