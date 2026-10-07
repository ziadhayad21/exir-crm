-- supabase/migrations/20240101000033_harden_lead_distribution.sql
-- Hardening Lead Distribution Rules (Modes A & B, Admin Exclusion, Concurrency & Inactive Employee Checks)

-- ═══════════════════════════════════════════════════════════════
-- 1. HARDEN VALIDATE_LEAD_ASSIGNMENT TRIGGER
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.validate_lead_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    -- Strictly require employee to be an eligible Sales rep (Admin is strictly excluded)
    IF NOT app.employee_is_eligible_sales(NEW.assigned_to) THEN
      RAISE EXCEPTION 'Lead assignment rejected: Employee % is not an eligible Sales employee or is an Admin.', NEW.assigned_to;
    END IF;

    -- Strictly require employee to be active
    IF NOT EXISTS (
      SELECT 1
      FROM app.employees
      WHERE id = NEW.assigned_to
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Lead assignment rejected: Employee % is not active.', NEW.assigned_to;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_lead_assignment ON app.leads;
CREATE TRIGGER trg_validate_lead_assignment
  BEFORE INSERT OR UPDATE OF assigned_to ON app.leads
  FOR EACH ROW
  EXECUTE FUNCTION app.validate_lead_assignment();

-- ═══════════════════════════════════════════════════════════════
-- 2. HARDEN LEAD TO CONVERSATION ASSIGNMENT SYNC TRIGGER
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.sync_lead_assignment_to_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) THEN
    UPDATE app.conversations
    SET assigned_to = NEW.assigned_to,
        status = CASE
                   WHEN NEW.assigned_to IS NOT NULL AND status = 'pending_assignment' THEN 'open'
                   ELSE status
                 END,
        updated_at = now()
    WHERE lead_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_assignment_sync_conv ON app.leads;
CREATE TRIGGER trg_lead_assignment_sync_conv
  AFTER INSERT OR UPDATE OF assigned_to ON app.leads
  FOR EACH ROW
  EXECUTE FUNCTION app.sync_lead_assignment_to_conversation();

-- ═══════════════════════════════════════════════════════════════
-- 3. HARDEN ASSIGN_LEAD_TO_SALES (MODES A & B)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.assign_lead_to_sales(
  p_lead_id UUID,
  p_business_tz TEXT DEFAULT 'Africa/Cairo',
  p_batch_limit INT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_tz TEXT;
  v_existing_owner UUID;
  v_assigned_employee_id UUID;
  v_today DATE;
  v_doy INT;
  v_has_online_sales BOOLEAN;
BEGIN
  -- 1. Advisory lock: serialize assignment operations to prevent race conditions
  PERFORM pg_advisory_xact_lock(7301);

  -- 2. Clean timezone with Africa/Cairo fallback
  v_tz := COALESCE(NULLIF(TRIM(p_business_tz), ''), 'Africa/Cairo');

  -- 3. Check if lead already has a valid eligible owner (Ownership Stability)
  IF p_lead_id IS NOT NULL THEN
    SELECT assigned_to INTO v_existing_owner
    FROM app.leads
    WHERE id = p_lead_id;

    IF v_existing_owner IS NOT NULL THEN
      IF app.employee_is_eligible_sales(v_existing_owner) THEN
        -- Existing ownership remains intact
        RETURN v_existing_owner;
      END IF;
    END IF;
  END IF;

  -- 4. Mark stale employees as offline (heartbeat > 5 min ago)
  UPDATE app.employees
  SET is_online = false
  WHERE is_online = true
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat < (now() - INTERVAL '5 minutes');

  -- 5. Calculate today's date and day-of-year in business timezone (Africa/Cairo)
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_doy   := EXTRACT(DOY FROM v_today)::int;

  -- 6. Determine whether any eligible Sales employees are currently ONLINE (MODE A check)
  SELECT EXISTS (
    SELECT 1
    FROM app.employees e
    WHERE e.is_active = true
      AND e.is_online = true
      AND app.employee_is_eligible_sales(e.id)
  ) INTO v_has_online_sales;

  -- 7. Select candidate pool:
  --    - MODE A: If >=1 eligible Sales rep is Online: candidate pool is ONLY Online Sales reps.
  --    - MODE B: If ALL eligible Sales reps are Offline: candidate pool is ALL active Sales reps.
  --    - Admin is ALWAYS excluded (app.employee_is_eligible_sales returns false for Admin).
  --    - Fair distribution: lowest today_count first, broken by rotating tie-breaker ((stable_pos + v_doy) % t.cnt).
  WITH eligible AS (
    SELECT e.id
    FROM app.employees e
    WHERE e.is_active = true
      AND app.employee_is_eligible_sales(e.id)
      AND (
        CASE
          WHEN v_has_online_sales THEN e.is_online = true
          ELSE true
        END
      )
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
        AND (COALESCE(l.received_at, l.created_at) AT TIME ZONE v_tz)::date = v_today
      GROUP BY l.assigned_to
    ) cnt ON cnt.assigned_to = el.id
  ),
  ranked AS (
    SELECT
      c.employee_id,
      c.today_count,
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

  -- 8. Persist Lead assignment if p_lead_id provided
  IF p_lead_id IS NOT NULL THEN
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
  END IF;

  RETURN v_assigned_employee_id;
END;
$$;

-- Public wrapper
CREATE OR REPLACE FUNCTION public.assign_lead_to_sales(
  p_lead_id UUID,
  p_business_tz TEXT DEFAULT 'Africa/Cairo',
  p_batch_limit INT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  RETURN app.assign_lead_to_sales(p_lead_id, p_business_tz, p_batch_limit);
END;
$$;

GRANT EXECUTE ON FUNCTION app.assign_lead_to_sales(UUID, TEXT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_lead_to_sales(UUID, TEXT, INT) TO authenticated, service_role;
