-- supabase/migrations/20240101000015_crm_expose_views.sql
-- Phase 2: CRM Core — Expose app schema tables to public schema via security_invoker views

CREATE OR REPLACE VIEW public.customers WITH (security_invoker = true) AS
  SELECT * FROM app.customers;

CREATE OR REPLACE VIEW public.services WITH (security_invoker = true) AS
  SELECT * FROM app.services;

CREATE OR REPLACE VIEW public.deals WITH (security_invoker = true) AS
  SELECT * FROM app.deals;

CREATE OR REPLACE VIEW public.deal_activities WITH (security_invoker = true) AS
  SELECT * FROM app.deal_activities;

-- ─── Grants on Views ─────────────────────────────────────────────

-- Customers
GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

-- Services
GRANT SELECT ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;

-- Deals
GRANT SELECT, INSERT, UPDATE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;

-- Deal Activities
GRANT SELECT, INSERT ON public.deal_activities TO authenticated;
GRANT ALL ON public.deal_activities TO service_role;
