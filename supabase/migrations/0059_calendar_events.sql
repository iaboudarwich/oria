-- Round 8 F4: Google Calendar events synced into Oria, categorized, and routed
-- to a section like Gmail items. One row per (user, connection, event). RLS:
-- own rows only.

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.cloud_connections(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  section_key text,
  provider_event_id text NOT NULL,
  title text NOT NULL,
  description text,
  location text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  is_all_day boolean NOT NULL DEFAULT false,
  organizer_email text,
  attendees jsonb,
  category text CHECK (category IN ('travel', 'health', 'meeting', 'personal', 'family', 'finance', 'other')),
  web_view_link text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connection_id, provider_event_id)
);

CREATE INDEX IF NOT EXISTS calendar_events_user_starts_idx ON public.calendar_events (user_id, starts_at);
CREATE INDEX IF NOT EXISTS calendar_events_org_section_idx ON public.calendar_events (organization_id, section_key);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY ce_read_own ON public.calendar_events FOR SELECT USING (user_id = auth.uid());
CREATE POLICY ce_write_own ON public.calendar_events FOR ALL USING (user_id = auth.uid());
