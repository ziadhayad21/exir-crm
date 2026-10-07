-- supabase/migrations/20240101000040_fix_change_lead_status_role_check.sql
-- Fix authorization query in app.change_lead_status to reference app.user_roles

CREATE OR REPLACE FUNCTION app.change_lead_status(
  p_lead_id UUID,
  p_new_status TEXT,
  p_changed_by UUID DEFAULT NULL,
  p_follow_up_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS app.leads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_lead app.leads%ROWTYPE;
  v_effective_follow_up_at TIMESTAMPTZ;
  v_updated_lead app.leads%ROWTYPE;
  v_is_admin BOOLEAN := false;
BEGIN
  -- 1. Validate requested status
  IF p_new_status NOT IN ('in_progress', 'follow_up', 'won', 'lose') THEN
    RAISE EXCEPTION 'Invalid lead status: %', p_new_status;
  END IF;

  -- 2. Safely lock the lead row
  SELECT * INTO v_lead
  FROM app.leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead with ID % not found', p_lead_id;
  END IF;

  -- 3. Authorization check if changed_by is passed
  IF p_changed_by IS NOT NULL THEN
    IF v_lead.assigned_to IS NOT NULL AND v_lead.assigned_to <> p_changed_by THEN
      SELECT EXISTS (
        SELECT 1 FROM app.user_roles ur
        JOIN app.roles r ON r.id = ur.role_id
        WHERE ur.employee_id = p_changed_by AND r.name = 'Admin'
      ) INTO v_is_admin;

      IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Unauthorized: cannot modify another employee''s lead';
      END IF;
    END IF;
  END IF;

  -- 4. Validate follow_up_at
  IF p_new_status = 'follow_up' THEN
    IF p_follow_up_at IS NULL THEN
      RAISE EXCEPTION 'follow_up_at is required when setting status to follow_up';
    END IF;
    v_effective_follow_up_at := p_follow_up_at;
  ELSE
    v_effective_follow_up_at := NULL;
  END IF;

  -- 5. Atomically update lead
  UPDATE app.leads
  SET status = p_new_status,
      follow_up_at = v_effective_follow_up_at,
      follow_up_notification_sent_at = NULL,
      updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO v_updated_lead;

  -- 6. Record status history (append-only)
  INSERT INTO app.lead_status_history (
    lead_id,
    changed_by,
    old_status,
    new_status,
    changed_at,
    follow_up_at,
    notes
  ) VALUES (
    p_lead_id,
    p_changed_by,
    v_lead.status,
    p_new_status,
    now(),
    v_effective_follow_up_at,
    p_notes
  );

  RETURN v_updated_lead;
END;
$$;
