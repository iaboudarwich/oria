-- Round 11 F4: per-user reasoning preference for Ask Oria.
--   auto   (default): the cheap classifier runs; an offer pill appears when an
--                     analytical question is detected.
--   manual: no classifier, no pill; the "Think harder" button still works.
--   always: every Ask Oria query uses the reasoning tier.
--   never:  reasoning is disabled entirely (no button, no pill).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reasoning_mode text NOT NULL DEFAULT 'auto'
  CHECK (reasoning_mode IN ('auto', 'manual', 'always', 'never'));
