-- supabase/migrations/20240101000026_backlog_security_hardening.sql
-- Phase 4B Deep QA Security Hardening:
-- Clamps p_batch_limit to LEAST(5, GREATEST(1, COALESCE(p_batch_limit, 5)))
-- to prevent parameter tampering via RPC calls (e.g. p_batch_limit = 100/10000).

-- ═══════════════════════════════════════════════════════════════
-- 1. HARDEN ASSIGN_LEAD_TO_SALES
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS app.assign_lead_to_sales(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.assign_lead_to_sales(UUID, TEXT, INT);

CREATE OR REPLACE FUNCTION app.assign_lead_to_sales(
  p_lead_id UUID,
  p_business_tz TEXT DEFAULT 'Africa/Cairo',
  p_batch_limit INT DEFAULT 5
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_assigned_employee_id UUID;
  v_today DATE;
  v_doy INT;
  v_effective_batch_limit INT;
BEGIN
  -- Concurrency lock: serialize assignment operations
  PERFORM pg_advisory_xact_lock(7301);

  -- Security: Enforce hard ceiling of 5 (prevent parameter tampering via RPC)
  v_effective_batch_limit := LEAST(5, GREATEST(1, COALESCE(p_batch_limit, 5)));

  -- Step 0: Mark stale employees as offline (heartbeat > 5 min ago)
  UPDATE app.employees
  SET is_online = false
  WHERE is_online = true
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat < (now() - INTERVAL '5 minutes');

  -- Step 1: Calculate today's date in business timezone
  v_today := (now() AT TIME ZONE p_business_tz)::date;
  v_doy   := EXTRACT(DOY FROM v_today)::int;

  -- Step 2: Eligible sales employees with active backlog < v_effective_batch_limit
  -- and lowest lead count received today
  WITH eligible AS (
    SELECT e.id
    FROM app.employees e
    LEFT JOIN (
      SELECT l.assigned_to, COUNT(*) AS active_backlog_count
      FROM app.leads l
      WHERE l.assigned_to IS NOT NULL
        AND l.status = 'new'
      GROUP BY l.assigned_to
    ) ab ON ab.assigned_to = e.id
    WHERE e.is_active = true
      AND e.is_online = true
      AND app.employee_has_sales_role(e.id)
      AND COALESCE(ab.active_backlog_count, 0) < v_effective_batch_limit
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
        AND (COALESCE(l.received_at, l.created_at) AT TIME ZONE p_business_tz)::date = v_today
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

  -- Step 3: Update lead record
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

CREATE OR REPLACE FUNCTION public.assign_lead_to_sales(
  p_lead_id UUID,
  p_business_tz TEXT DEFAULT 'Africa/Cairo',
  p_batch_limit INT DEFAULT 5
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

-- ═══════════════════════════════════════════════════════════════
-- 2. HARDEN PROCESS_PENDING_UNASSIGNED_LEADS
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS app.process_pending_unassigned_leads(TEXT, INT);
DROP FUNCTION IF EXISTS public.process_pending_unassigned_leads(TEXT, INT);

CREATE OR REPLACE FUNCTION app.process_pending_unassigned_leads(
  p_business_tz TEXT DEFAULT 'Africa/Cairo',
  p_batch_limit INT DEFAULT 5
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_lead_record RECORD;
  v_assigned_emp UUID;
  v_count INT := 0;
  v_effective_batch_limit INT;
BEGIN
  -- 1. Acquire transaction advisory lock to serialize with assignment RPC
  PERFORM pg_advisory_xact_lock(7301);

  -- Security: Enforce hard ceiling of 5 (prevent parameter tampering via RPC)
  v_effective_batch_limit := LEAST(5, GREATEST(1, COALESCE(p_batch_limit, 5)));

  -- 2. Mark stale employees as offline (heartbeat > 5 min ago)
  UPDATE app.employees
  SET is_online = false
  WHERE is_online = true
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat < (now() - INTERVAL '5 minutes');

  -- 3. Verify at least one eligible Sales employee is currently online, active, and has capacity < v_effective_batch_limit
  IF NOT EXISTS (
    SELECT 1 FROM app.employees e
    LEFT JOIN (
      SELECT l.assigned_to, COUNT(*) AS active_backlog_count
      FROM app.leads l
      WHERE l.assigned_to IS NOT NULL
        AND l.status = 'new'
      GROUP BY l.assigned_to
    ) ab ON ab.assigned_to = e.id
    WHERE e.is_active = true
      AND e.is_online = true
      AND app.employee_has_sales_role(e.id)
      AND COALESCE(ab.active_backlog_count, 0) < v_effective_batch_limit
  ) THEN
    RETURN 0;
  END IF;

  -- 4. Iterate over pending leads in strict FIFO order (oldest received_at first, then created_at)
  FOR v_lead_record IN (
    SELECT id
    FROM app.leads
    WHERE assigned_to IS NULL
      AND assignment_source = 'unassigned'
      AND status = 'new'
    ORDER BY received_at ASC, created_at ASC
  ) LOOP
    v_assigned_emp := app.assign_lead_to_sales(v_lead_record.id, p_business_tz, v_effective_batch_limit);

    IF v_assigned_emp IS NOT NULL THEN
      -- Sync conversation status and assignment if not already done by trigger
      UPDATE app.conversations
      SET assigned_to = v_assigned_emp,
          status = 'open',
          updated_at = now()
      WHERE lead_id = v_lead_record.id
        AND (assigned_to IS NULL OR status = 'pending_assignment');

      v_count := v_count + 1;
    ELSE
      -- No eligible employee with available capacity remains; stop iteration early
      EXIT;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_pending_unassigned_leads(
  p_business_tz TEXT DEFAULT 'Africa/Cairo',
  p_batch_limit INT DEFAULT 5
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  RETURN app.process_pending_unassigned_leads(p_business_tz, p_batch_limit);
END;
$$;

-- Grants & Revokes
GRANT EXECUTE ON FUNCTION app.assign_lead_to_sales(UUID, TEXT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_lead_to_sales(UUID, TEXT, INT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.assign_lead_to_sales(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION app.process_pending_unassigned_leads(TEXT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_pending_unassigned_leads(TEXT, INT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.process_pending_unassigned_leads(TEXT, INT) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
