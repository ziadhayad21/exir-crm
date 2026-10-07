-- supabase/migrations/20240101000044_fix_lead_module_visibility_rls.sql
-- Fix Lead Module Visibility:
-- Ensure public.leads view enforces Row Level Security via WITH (security_invoker = true)
-- and optimize leads_select_own / leads_select_all RLS policies on app.leads with InitPlan wrapping.

-- 1. Ensure RLS is enabled on app.leads
ALTER TABLE app.leads ENABLE ROW LEVEL SECURITY;

-- 2. Optimize and enforce SELECT policies on app.leads
DROP POLICY IF EXISTS leads_select_own ON app.leads;
CREATE POLICY leads_select_own ON app.leads
  FOR SELECT TO authenticated
  USING (
    assigned_to = (SELECT app.get_current_employee_id())
    AND (SELECT app.has_permission('crm.leads.read_own'))
  );

DROP POLICY IF EXISTS leads_select_all ON app.leads;
CREATE POLICY leads_select_all ON app.leads
  FOR SELECT TO authenticated
  USING (
    (SELECT app.has_permission('crm.leads.read_all'))
  );

-- 3. Recreate public.leads view WITH (security_invoker = true)
-- In migrations 41 & 42, CREATE OR REPLACE VIEW public.leads was called without
-- WITH (security_invoker = true), reverting the view to SECURITY DEFINER and
-- causing PostgREST / client requests to execute as view owner (postgres),
-- completely bypassing RLS on app.leads.
CREATE OR REPLACE VIEW public.leads WITH (security_invoker = true) AS
SELECT * FROM app.leads;

-- 4. Re-grant permissions on public.leads
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated, anon;
GRANT ALL ON public.leads TO service_role;

NOTIFY pgrst, 'reload schema';
