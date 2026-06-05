-- 0083_message_artifacts.sql
-- Round 19 Part 1: live artifacts in Ask. An assistant message can carry a
-- small structured artifact (a chart, checklist, table, or stat card) rendered
-- inline below the text. Stored on the message so it survives a reload.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS artifact_type text
    CHECK (artifact_type IN ('chart', 'checklist', 'table', 'stat_card')),
  ADD COLUMN IF NOT EXISTS artifact jsonb;
