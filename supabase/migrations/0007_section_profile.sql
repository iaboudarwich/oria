-- Oria: per-section profile.
-- Holds the lightweight onboarding answers that help Oria route uploads
-- accurately into a user's custom section. Shape (all optional):
--   {
--     "kinds":    ["documents", "receipts", "notes", ...],
--     "mode":     "personal" | "shared" | "work" | "family" | "archive" | "active",
--     "priority": "reminders" | "search" | "storage" | "collaboration" | "timeline",
--     "related":  "Acme Corp, Jane Smith, taxes"
--   }
-- The classifier reads `kinds`, `related`, and the section name as match
-- keywords. `mode` and `priority` are stored for future model use.

alter table public.custom_sections
  add column if not exists profile jsonb not null default '{}'::jsonb;
