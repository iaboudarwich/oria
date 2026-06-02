-- Round 9 F1: Microsoft Graph as a provider. Outlook mail joins email_connections;
-- OneDrive + Outlook Calendar join cloud_connections. Extend the CHECK
-- constraints to admit the new provider/service values. Idempotent.

ALTER TABLE public.email_connections DROP CONSTRAINT IF EXISTS email_connections_provider_check;
ALTER TABLE public.email_connections
  ADD CONSTRAINT email_connections_provider_check CHECK (provider IN ('gmail', 'outlook'));

ALTER TABLE public.cloud_connections DROP CONSTRAINT IF EXISTS cloud_connections_provider_check;
ALTER TABLE public.cloud_connections
  ADD CONSTRAINT cloud_connections_provider_check CHECK (provider IN ('google', 'microsoft'));

ALTER TABLE public.cloud_connections DROP CONSTRAINT IF EXISTS cloud_connections_service_check;
ALTER TABLE public.cloud_connections
  ADD CONSTRAINT cloud_connections_service_check
  CHECK (service IN ('calendar', 'drive', 'onedrive', 'outlook_calendar'));
