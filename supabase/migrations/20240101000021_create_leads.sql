-- supabase/migrations/20240101000021_create_leads.sql
-- Phase 3: Daily Lead Assignment & Routing
-- Creates leads table, employee availability, atomic assignment function,
-- RLS policies, indexes, and public schema exposure.
-- Additive only — does NOT modify or delete any existing Phase 1/2 objects.

-- ═══════════════════════════════════════════════════════════════
-- 1. EMPLOYEE AVAILABILITY COLUMNS
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE app.employees
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_employees_is_online
  ON app.employees(is_online) WHERE is_online = true;

COMMENT ON COLUMN app.employees.is_online IS 'Whether the employee is currently available to receive new leads';
COMMENT ON COLUMN app.employees.last_heartbeat IS 'Last heartbeat timestamp for staleness detection';

-- ═══════════════════════════════════════════════════════════════
-- 2. LEADS TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app.leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Contact info
  full_name         TEXT NOT NULL CHECK (char_length(full_name) > 0),
  phone             TEXT,
  email             TEXT CHECK (email IS NULL OR email ~* '^[^@]+@[^@]+\.[^@]+$'),
  source            TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual','referral','walk_in','website','social_media','whatsapp','phone_call','other')),
  notes             TEXT,
  -- Assignment
  assigned_to       UUID REFERENCES app.employees(id) ON DELETE SET NULL,
  assigned_at       TIMESTAMPTZ,
  assignment_source TEXT NOT NULL DEFAULT 'unassigned'
                      CHECK (assignment_source IN ('automatic','manual','unassigned')),
  -- Status (simple: not a pipeline)
  status            TEXT NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new','contacted','converted','lost')),
  -- Conversion references (preserved for audit; Lead record is never deleted)
  converted_to_customer_id UUID REFERENCES app.customers(id) ON DELETE SET NULL,
  converted_to_deal_id     UUID REFERENCES app.deals(id) ON DELETE SET NULL,
  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- At least one contact method required
  CONSTRAINT leads_contact_check CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

-- Grants on app.leads table
GRANT SELECT, INSERT, UPDATE, DELETE ON app.leads TO authenticated;
GRANT ALL ON app.leads TO service_role;

-- ═══════════════════════════════════════════════════════════════
-- 3. INDEXES
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON app.leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON app.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON app.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_at ON app.leads(assigned_at);
CREATE INDEX IF NOT EXISTS idx_leads_source ON app.leads(source);

COMMENT ON TABLE app.leads IS 'Incoming lead/inquiry records for automatic assignment to Sales employees';
COMMENT ON COLUMN app.leads.assigned_to IS 'Sales employee assigned to handle this lead';
COMMENT ON COLUMN app.leads.assignment_source IS 'How the assignment was made: automatic, manual, or unassigned';
COMMENT ON COLUMN app.leads.status IS 'Lead lifecycle: new → contacted → converted|lost';
COMMENT ON COLUMN app.leads.converted_to_customer_id IS 'Customer record created from this lead (if converted)';
COMMENT ON COLUMN app.leads.converted_to_deal_id IS 'Deal record created from this lead (if converted)';

-- ═══════════════════════════════════════════════════════════════
-- 4. ATOMIC LEAD ASSIGNMENT FUNCTION (CONCURRENCY-SAFE)
-- ═══════════════════════════════════════════════════════════════

-- Helper: Check if an employee has the Sales role
CREATE OR REPLACE FUNCTION app.employee_has_sales_role(p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.user_roles ur
    JOIN app.roles r ON r.id = ur.role_id
    WHERE ur.employee_id = p_employee_id
      AND r.name = 'Sales'
  );
$$;

COMMENT ON FUNCTION app.employee_has_sales_role(UUID) IS 'Returns true if the employee has the Sales role';

-- Main assignment function
CREATE OR REPLACE FUNCTION app.assign_lead_to_sales(
  p_lead_id UUID,
  p_business_tz TEXT DEFAULT 'Africa/Cairo'
)
RETURNS UUID -- returns assigned employee_id, or NULL if no one is eligible
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_assigned_employee_id UUID;
  v_today DATE;
  v_doy INT;
BEGIN
  -- ──────────────────────────────────────────────────────────────
  -- CONCURRENCY LOCK: Only one assignment can run at a time.
  -- advisory_xact_lock is released automatically when TX commits.
  -- Key 7301 is a fixed hash for lead assignment serialization.
  -- ──────────────────────────────────────────────────────────────
  PERFORM pg_advisory_xact_lock(7301);

  -- ──────────────────────────────────────────────────────────────
  -- STEP 0: Mark stale employees as offline (heartbeat > 5 min ago)
  -- ──────────────────────────────────────────────────────────────
  UPDATE app.employees
  SET is_online = false
  WHERE is_online = true
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat < (now() - INTERVAL '5 minutes');

  -- ──────────────────────────────────────────────────────────────
  -- STEP 1: Calculate today's date and day-of-year for tie-breaking
  -- ──────────────────────────────────────────────────────────────
  v_today := (now() AT TIME ZONE p_business_tz)::date;
  v_doy   := EXTRACT(DOY FROM v_today)::int;

  -- ──────────────────────────────────────────────────────────────
  -- STEP 2: Find the eligible employee with the lowest today count.
  -- Tie-breaker: deterministic daily rotation by DOY + row position.
  -- Employees are first sorted by UUID for stable ordering,
  -- then rotated by (doy + position) % total to shift daily priority.
  -- ──────────────────────────────────────────────────────────────
  WITH eligible AS (
    SELECT e.id
    FROM app.employees e
    WHERE e.is_active = true
      AND e.is_online = true
      AND app.employee_has_sales_role(e.id)
  ),
  counted AS (
    SELECT
      el.id AS employee_id,
      COALESCE(cnt.today_count, 0) AS today_count
    FROM eligible el
    LEFT JOIN (
      SELECT l.assigned_to, COUNT(*) AS today_count
      FROM app.leads l
      WHERE l.assigned_to IS NOT NULL
        AND (l.assigned_at AT TIME ZONE p_business_tz)::date = v_today
      GROUP BY l.assigned_to
    ) cnt ON cnt.assigned_to = el.id
  ),
  ranked AS (
    SELECT
      c.employee_id,
      c.today_count,
      -- Stable sort by UUID, then rotate by DOY
      ROW_NUMBER() OVER (ORDER BY c.employee_id) - 1 AS stable_pos
    FROM counted c
  ),
  total AS (
    SELECT COUNT(*) AS cnt FROM ranked
  )
  SELECT r.employee_id
  INTO v_assigned_employee_id
  FROM ranked r, total t
  WHERE t.cnt > 0
  ORDER BY
    r.today_count ASC,
    ((r.stable_pos + v_doy) % t.cnt) ASC
  LIMIT 1;

  -- ──────────────────────────────────────────────────────────────
  -- STEP 3: Update lead with assignment (or leave unassigned)
  -- ──────────────────────────────────────────────────────────────
  IF v_assigned_employee_id IS NOT NULL THEN
    UPDATE app.leads
    SET assigned_to = v_assigned_employee_id,
        assigned_at = now(),
        assignment_source = 'automatic',
        updated_at = now()
    WHERE id = p_lead_id;
  ELSE
    UPDATE app.leads
    SET assignment_source = 'unassigned',
        updated_at = now()
    WHERE id = p_lead_id;
  END IF;

  RETURN v_assigned_employee_id;
END;
$$;

COMMENT ON FUNCTION app.assign_lead_to_sales(UUID, TEXT) IS
  'Atomically assigns a lead to the eligible online Sales employee with the fewest leads today. '
  'Uses pg_advisory_xact_lock for concurrency safety. Returns the assigned employee_id or NULL.';

-- ═══════════════════════════════════════════════════════════════
-- 5. RLS POLICIES FOR LEADS
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE app.leads ENABLE ROW LEVEL SECURITY;

-- Sales: see own assigned leads
DROP POLICY IF EXISTS leads_select_own ON app.leads;
CREATE POLICY leads_select_own ON app.leads
  FOR SELECT TO authenticated
  USING (
    assigned_to = app.get_current_employee_id()
    AND app.has_permission('crm.leads.read_own')
  );

-- Admin / managers: see all leads
DROP POLICY IF EXISTS leads_select_all ON app.leads;
CREATE POLICY leads_select_all ON app.leads
  FOR SELECT TO authenticated
  USING (app.has_permission('crm.leads.read_all'));

-- Insert: service_role inserts via server actions (admin client).
-- Also allow authenticated users with crm.leads.write for flexibility.
DROP POLICY IF EXISTS leads_insert ON app.leads;
CREATE POLICY leads_insert ON app.leads
  FOR INSERT TO authenticated
  WITH CHECK (app.has_permission('crm.leads.write'));

-- Update own assigned leads
DROP POLICY IF EXISTS leads_update_own ON app.leads;
CREATE POLICY leads_update_own ON app.leads
  FOR UPDATE TO authenticated
  USING (
    assigned_to = app.get_current_employee_id()
    AND app.has_permission('crm.leads.write')
  )
  WITH CHECK (app.has_permission('crm.leads.write'));

-- Admin can update any lead
DROP POLICY IF EXISTS leads_update_all ON app.leads;
CREATE POLICY leads_update_all ON app.leads
  FOR UPDATE TO authenticated
  USING (
    app.has_permission('crm.leads.read_all')
    AND app.has_permission('crm.leads.write')
  )
  WITH CHECK (app.has_permission('crm.leads.write'));

-- ═══════════════════════════════════════════════════════════════
-- 6. PUBLIC SCHEMA VIEW
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.leads WITH (security_invoker = true) AS
  SELECT * FROM app.leads;

GRANT SELECT, INSERT, UPDATE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

-- ═══════════════════════════════════════════════════════════════
-- 7. EXPOSE ASSIGNMENT RPC (service_role ONLY)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assign_lead_to_sales(
  p_lead_id UUID,
  p_business_tz TEXT DEFAULT 'Africa/Cairo'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  RETURN app.assign_lead_to_sales(p_lead_id, p_business_tz);
END;
$$;

REVOKE ALL ON FUNCTION public.assign_lead_to_sales(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_lead_to_sales(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION app.assign_lead_to_sales(UUID, TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION app.assign_lead_to_sales(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION app.employee_has_sales_role(UUID) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION app.employee_has_sales_role(UUID) TO service_role;

COMMENT ON FUNCTION public.assign_lead_to_sales IS 'Atomic lead assignment RPC. Restricted to service_role.';

-- ═══════════════════════════════════════════════════════════════
-- 8. CONFIGURE LEAD PERMISSIONS (ROLE ISOLATION)
-- ═══════════════════════════════════════════════════════════════

-- Ensure Sales role has isolated permissions: read_own and write ONLY
-- Revoke crm.leads.read_all from Sales (was placed as Phase 1 placeholder)
DELETE FROM app.role_permissions
WHERE role_id = 'a0000000-0000-0000-0000-000000000002'
  AND permission_id = 'b0000000-0000-0000-0000-000000000011';

-- Ensure Sales has crm.leads.read_own and crm.leads.write
INSERT INTO app.role_permissions (role_id, permission_id) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000010'),
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000012')
ON CONFLICT DO NOTHING;

-- Ensure Admin has all lead permissions
INSERT INTO app.role_permissions (role_id, permission_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000010'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000011'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000012')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 9. REFRESH public.employees VIEW (to include new columns)
-- ═══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.employees;
CREATE VIEW public.employees WITH (security_invoker = true) AS
  SELECT * FROM app.employees;

GRANT SELECT, INSERT, UPDATE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
