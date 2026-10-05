-- supabase/migrations/20240101000013_crm_permissions.sql
-- Phase 2: CRM Core — Permissions, Role Mappings, and Atomic CRM RPCs

-- ─── 1. CRM Permissions ──────────────────────────────────────────

INSERT INTO app.permissions (id, key, description, module) VALUES
  ('b0000000-0000-0000-0000-000000000101', 'crm.customers.read_own', 'View own created customers',                               'crm'),
  ('b0000000-0000-0000-0000-000000000102', 'crm.customers.read_all', 'View all customers',                                       'crm'),
  ('b0000000-0000-0000-0000-000000000103', 'crm.customers.write',    'Create and modify customers',                               'crm'),
  ('b0000000-0000-0000-0000-000000000104', 'crm.services.read',      'View services catalog',                                     'crm'),
  ('b0000000-0000-0000-0000-000000000105', 'crm.services.write',     'Create and modify services catalog',                        'crm'),
  ('b0000000-0000-0000-0000-000000000106', 'crm.deals.read_own',     'View own assigned or created deals',                        'crm'),
  ('b0000000-0000-0000-0000-000000000107', 'crm.deals.read_all',     'View all deals',                                            'crm'),
  ('b0000000-0000-0000-0000-000000000108', 'crm.deals.write',        'Create, update, and manage deal stages and activities',     'crm'),
  ('b0000000-0000-0000-0000-000000000109', 'crm.deals.reassign',     'Reassign owned deals to other employees',                   'crm'),
  ('b0000000-0000-0000-0000-000000000110', 'crm.pipeline.view',      'View the CRM Kanban pipeline',                              'crm')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  module = EXCLUDED.module;

-- ─── 2. Role ↔ Permission Assignments ────────────────────────────

-- Admin gets all CRM permissions
INSERT INTO app.role_permissions (role_id, permission_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000101'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000102'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000103'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000104'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000105'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000106'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000107'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000108'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000109'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000110')
ON CONFLICT DO NOTHING;

-- Sales gets isolated CRM permissions (NO crm.customers.read_all, NO crm.deals.read_all)
INSERT INTO app.role_permissions (role_id, permission_id) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000101'), -- crm.customers.read_own
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000103'), -- crm.customers.write
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000104'), -- crm.services.read
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000106'), -- crm.deals.read_own
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000108'), -- crm.deals.write
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000109'), -- crm.deals.reassign
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000110')  -- crm.pipeline.view
ON CONFLICT DO NOTHING;

-- Accountant gets read-only context across all customers, deals, services, and pipeline
INSERT INTO app.role_permissions (role_id, permission_id) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000102'), -- crm.customers.read_all
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000107'), -- crm.deals.read_all
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000104'), -- crm.services.read
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000110')  -- crm.pipeline.view
ON CONFLICT DO NOTHING;

-- HR receives zero CRM permissions (unchanged)

-- ─── 3. Atomic CRM RPC Functions (service_role only) ─────────────

-- 3.1 Stage change: updates deal stage, manages lost_reason, appends timeline activity
CREATE OR REPLACE FUNCTION app.crm_change_deal_stage(
  p_deal_id UUID,
  p_new_stage TEXT,
  p_actor_id UUID,
  p_lost_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_old_stage TEXT;
BEGIN
  -- Read current stage internally (lock the row)
  SELECT stage INTO v_old_stage
  FROM app.deals
  WHERE id = p_deal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found: %', p_deal_id;
  END IF;

  IF v_old_stage = p_new_stage THEN
    RETURN;
  END IF;

  -- Update deal stage and lost_reason (cleared if leaving lost)
  UPDATE app.deals
  SET stage = p_new_stage,
      lost_reason = CASE
        WHEN p_new_stage = 'lost' THEN p_lost_reason
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = p_deal_id;

  -- Insert stage change timeline activity
  INSERT INTO app.deal_activities (deal_id, actor_id, type, content, metadata)
  VALUES (
    p_deal_id,
    p_actor_id,
    'stage_change',
    'Stage changed from ' || v_old_stage || ' to ' || p_new_stage,
    jsonb_build_object(
      'old_stage', v_old_stage,
      'new_stage', p_new_stage,
      'lost_reason', p_lost_reason
    )
  );
END;
$$;

-- 3.2 Deal creation: inserts deal and appends initial timeline activity
CREATE OR REPLACE FUNCTION app.crm_create_deal(
  p_title TEXT,
  p_customer_id UUID,
  p_service_id UUID,
  p_assigned_to UUID,
  p_value NUMERIC,
  p_expected_close_date DATE,
  p_notes TEXT,
  p_created_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_deal_id UUID;
BEGIN
  INSERT INTO app.deals (
    title, customer_id, service_id, assigned_to, stage,
    value, currency, expected_close_date, notes, created_by
  ) VALUES (
    p_title, p_customer_id, p_service_id, p_assigned_to, 'new',
    p_value, 'EGP', p_expected_close_date, p_notes, p_created_by
  )
  RETURNING id INTO v_deal_id;

  INSERT INTO app.deal_activities (deal_id, actor_id, type, content)
  VALUES (v_deal_id, p_created_by, 'system', 'Deal created');

  RETURN v_deal_id;
END;
$$;

-- 3.3 Deal reassignment: updates assignee and appends reassignment timeline activity
CREATE OR REPLACE FUNCTION app.crm_reassign_deal(
  p_deal_id UUID,
  p_new_assignee UUID,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_old_assignee UUID;
  v_old_name TEXT;
  v_new_name TEXT;
BEGIN
  SELECT assigned_to INTO v_old_assignee
  FROM app.deals
  WHERE id = p_deal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal not found: %', p_deal_id;
  END IF;

  IF v_old_assignee = p_new_assignee THEN
    RETURN;
  END IF;

  SELECT full_name INTO v_old_name FROM app.employees WHERE id = v_old_assignee;
  SELECT full_name INTO v_new_name FROM app.employees WHERE id = p_new_assignee;

  UPDATE app.deals
  SET assigned_to = p_new_assignee, updated_at = now()
  WHERE id = p_deal_id;

  INSERT INTO app.deal_activities (deal_id, actor_id, type, content, metadata)
  VALUES (
    p_deal_id,
    p_actor_id,
    'system',
    'Reassigned from ' || COALESCE(v_old_name, 'unknown') || ' to ' || COALESCE(v_new_name, 'unknown'),
    jsonb_build_object('old_assignee', v_old_assignee, 'new_assignee', p_new_assignee)
  );
END;
$$;

-- ─── 4. RPC Permissions (service_role ONLY — NEVER authenticated) ─

REVOKE ALL ON FUNCTION app.crm_change_deal_stage(UUID, TEXT, UUID, TEXT) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION app.crm_change_deal_stage(UUID, TEXT, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION app.crm_create_deal(TEXT, UUID, UUID, UUID, NUMERIC, DATE, TEXT, UUID) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION app.crm_create_deal(TEXT, UUID, UUID, UUID, NUMERIC, DATE, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION app.crm_reassign_deal(UUID, UUID, UUID) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION app.crm_reassign_deal(UUID, UUID, UUID) TO service_role;
