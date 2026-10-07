-- supabase/migrations/20240101000039_refresh_lead_views.sql
-- Refresh public views for leads, lead_status_history, and notifications
-- to include follow_up_at and new tables in PostgREST schema cache.

DROP VIEW IF EXISTS public.leads CASCADE;
CREATE VIEW public.leads WITH (security_invoker = true) AS
  SELECT * FROM app.leads;

DROP VIEW IF EXISTS public.lead_status_history CASCADE;
CREATE VIEW public.lead_status_history WITH (security_invoker = true) AS
  SELECT * FROM app.lead_status_history;

DROP VIEW IF EXISTS public.notifications CASCADE;
CREATE VIEW public.notifications WITH (security_invoker = true) AS
  SELECT * FROM app.notifications;

GRANT ALL ON public.leads TO authenticated, service_role;
GRANT ALL ON public.lead_status_history TO authenticated, service_role;
GRANT ALL ON public.notifications TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
