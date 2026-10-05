-- supabase/migrations/20240101000014_crm_rls.sql
-- Phase 2: CRM Core — Row Level Security Policies
-- Enforces deny-by-default, isolated visibility for Sales, and full access for Admin.

-- ═══════════════════════════════════════════════════════════════
-- 1. CUSTOMERS
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE app.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_select_own ON app.customers;
CREATE POLICY customers_select_own ON app.customers
  FOR SELECT TO authenticated
  USING (
    created_by = app.get_current_employee_id()
    AND app.has_permission('crm.customers.read_own')
  );

DROP POLICY IF EXISTS customers_select_all ON app.customers;
CREATE POLICY customers_select_all ON app.customers
  FOR SELECT TO authenticated
  USING (app.has_permission('crm.customers.read_all'));

DROP POLICY IF EXISTS customers_insert ON app.customers;
CREATE POLICY customers_insert ON app.customers
  FOR INSERT TO authenticated
  WITH CHECK (app.has_permission('crm.customers.write'));

DROP POLICY IF EXISTS customers_update ON app.customers;
CREATE POLICY customers_update ON app.customers
  FOR UPDATE TO authenticated
  USING (
    (created_by = app.get_current_employee_id() AND app.has_permission('crm.customers.write'))
    OR (app.has_permission('crm.customers.read_all') AND app.has_permission('crm.customers.write'))
  )
  WITH CHECK (app.has_permission('crm.customers.write'));

-- ═══════════════════════════════════════════════════════════════
-- 2. SERVICES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE app.services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_select ON app.services;
CREATE POLICY services_select ON app.services
  FOR SELECT TO authenticated
  USING (app.has_permission('crm.services.read'));

DROP POLICY IF EXISTS services_insert ON app.services;
CREATE POLICY services_insert ON app.services
  FOR INSERT TO authenticated
  WITH CHECK (app.has_permission('crm.services.write'));

DROP POLICY IF EXISTS services_update ON app.services;
CREATE POLICY services_update ON app.services
  FOR UPDATE TO authenticated
  USING (app.has_permission('crm.services.write'))
  WITH CHECK (app.has_permission('crm.services.write'));

-- ═══════════════════════════════════════════════════════════════
-- 3. DEALS
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE app.deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deals_select_own ON app.deals;
CREATE POLICY deals_select_own ON app.deals
  FOR SELECT TO authenticated
  USING (
    (assigned_to = app.get_current_employee_id() OR created_by = app.get_current_employee_id())
    AND app.has_permission('crm.deals.read_own')
  );

DROP POLICY IF EXISTS deals_select_all ON app.deals;
CREATE POLICY deals_select_all ON app.deals
  FOR SELECT TO authenticated
  USING (app.has_permission('crm.deals.read_all'));

DROP POLICY IF EXISTS deals_insert ON app.deals;
CREATE POLICY deals_insert ON app.deals
  FOR INSERT TO authenticated
  WITH CHECK (app.has_permission('crm.deals.write'));

DROP POLICY IF EXISTS deals_update ON app.deals;
CREATE POLICY deals_update ON app.deals
  FOR UPDATE TO authenticated
  USING (
    (
      (assigned_to = app.get_current_employee_id() OR created_by = app.get_current_employee_id())
      AND app.has_permission('crm.deals.write')
    )
    OR (app.has_permission('crm.deals.read_all') AND app.has_permission('crm.deals.write'))
  )
  WITH CHECK (app.has_permission('crm.deals.write'));

-- ═══════════════════════════════════════════════════════════════
-- 4. DEAL ACTIVITIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE app.deal_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_activities_select ON app.deal_activities;
CREATE POLICY deal_activities_select ON app.deal_activities
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app.deals d
      WHERE d.id = deal_id
    )
  );

DROP POLICY IF EXISTS deal_activities_insert ON app.deal_activities;
CREATE POLICY deal_activities_insert ON app.deal_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    app.has_permission('crm.deals.write')
    AND EXISTS (
      SELECT 1 FROM app.deals d
      WHERE d.id = deal_id
        AND (
          d.assigned_to = app.get_current_employee_id()
          OR d.created_by = app.get_current_employee_id()
          OR app.has_permission('crm.deals.read_all')
        )
    )
  );
