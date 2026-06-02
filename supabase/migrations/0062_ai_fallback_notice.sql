-- Round 10 F3: a one-time, non-blocking notice shown when a user's connected AI
-- silently falls back to Oria's default at query time (key went invalid, rate
-- limited, or out of credits). Cleared once the toast is shown.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_ai_notice jsonb;
