-- supabase/migrations/20240101000019_customer_soft_delete.sql
-- Phase 2: CRM Core — Customer Soft Delete Support
-- Adds deleted_at to app.customers, updates RLS, and exposes via public.customers view.

-- 1. Add deleted_at column
ALTER TABLE app.customers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON app.customers(deleted_at);
CREATE INDEX IF NOT EXISTS idx_customers_active_phone ON app.customers(phone) WHERE deleted_at IS NULL AND phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_active_email ON app.customers(email) WHERE deleted_at IS NULL AND email IS NOT NULL;

-- 3. Update RLS policies to exclude soft-deleted records
DROP POLICY IF EXISTS customers_select_own ON app.customers;
CREATE POLICY customers_select_own ON app.customers
  FOR SELECT TO authenticated
  USING (
    created_by = app.get_current_employee_id()
    AND app.has_permission('crm.customers.read_own')
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS customers_select_all ON app.customers;
CREATE POLICY customers_select_all ON app.customers
  FOR SELECT TO authenticated
  USING (
    app.has_permission('crm.customers.read_all')
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS customers_update ON app.customers;
CREATE POLICY customers_update ON app.customers
  FOR UPDATE TO authenticated
  USING (
    (
      (created_by = app.get_current_employee_id() AND app.has_permission('crm.customers.write'))
      OR (app.has_permission('crm.customers.read_all') AND app.has_permission('crm.customers.write'))
    )
    AND deleted_at IS NULL
  )
  WITH CHECK (app.has_permission('crm.customers.write'));

-- 4. Recreate public.customers view with deleted_at
DROP VIEW IF EXISTS public.customers;

CREATE VIEW public.customers WITH (security_invoker = true) AS
  SELECT
    id,
    full_name,
    email,
    phone,
    source,
    notes,
    created_by,
    created_at,
    updated_at,
    deleted_at
  FROM app.customers;

GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
