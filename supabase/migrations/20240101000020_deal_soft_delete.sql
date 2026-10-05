-- supabase/migrations/20240101000020_deal_soft_delete.sql
-- Phase 2: CRM Core — Deal Soft Delete Support
-- Adds deleted_at to app.deals, updates RLS, and exposes via public.deals view.

-- 1. Add deleted_at column
ALTER TABLE app.deals
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Index for performance
CREATE INDEX IF NOT EXISTS idx_deals_deleted_at ON app.deals(deleted_at);

-- 3. Update RLS policies to exclude soft-deleted deals
DROP POLICY IF EXISTS deals_select_own ON app.deals;
CREATE POLICY deals_select_own ON app.deals
  FOR SELECT TO authenticated
  USING (
    (assigned_to = app.get_current_employee_id() OR created_by = app.get_current_employee_id())
    AND app.has_permission('crm.deals.read_own')
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS deals_select_all ON app.deals;
CREATE POLICY deals_select_all ON app.deals
  FOR SELECT TO authenticated
  USING (
    app.has_permission('crm.deals.read_all')
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS deals_update ON app.deals;
CREATE POLICY deals_update ON app.deals
  FOR UPDATE TO authenticated
  USING (
    (
      ((assigned_to = app.get_current_employee_id() OR created_by = app.get_current_employee_id()) AND app.has_permission('crm.deals.write'))
      OR (app.has_permission('crm.deals.read_all') AND app.has_permission('crm.deals.write'))
    )
    AND deleted_at IS NULL
  )
  WITH CHECK (app.has_permission('crm.deals.write'));

-- 4. Recreate public.deals view with deleted_at
DROP VIEW IF EXISTS public.deals;

CREATE VIEW public.deals WITH (security_invoker = true) AS
  SELECT * FROM app.deals;

GRANT SELECT, INSERT, UPDATE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;
