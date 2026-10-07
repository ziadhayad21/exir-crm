-- supabase/migrations/20240101000034_offline_transferable_leads.sql
-- Prompt 3: Offline Lead Handling + Transferable Leads + Fair Transfer in Batches of 2
-- 
-- Key Business Rules:
-- 1. Going Offline does NOT automatically remove Leads from an employee.
-- 2. A Lead is Transferable ONLY when BOTH:
--    a) Current Lead Owner is Offline (or inactive/stale heartbeat).
--    b) Current Lead Owner has NOT sent any actual outbound message to the customer for that Lead.
-- 3. Online Sales employees can claim transferable Leads ONLY when they are Online AND have 0 active Leads.
-- 4. Transfer Batch Size = AT MOST 2 Leads per claim.
-- 5. FIFO Backlog selection (oldest COALESCE(received_at, created_at) first).
-- 6. Replaying outbound message protects lead from transfer permanently.
-- 7. Admin receives 0 transferable leads.

-- ═══════════════════════════════════════════════════════════════
-- 1. HELPER: CHECK IF A LEAD HAS AN OUTBOUND EMPLOYEE MESSAGE
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.lead_has_outbound_message(p_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.messages m
    JOIN app.conversations c ON c.id = m.conversation_id
    WHERE c.lead_id = p_lead_id
      AND m.direction = 'outbound'
      AND m.sender_type = 'employee'
  );
$$;

COMMENT ON FUNCTION app.lead_has_outbound_message(UUID) IS
  'Returns true IF AND ONLY IF an employee has sent at least one actual outbound message to the customer for this Lead.';

-- ═══════════════════════════════════════════════════════════════
-- 2. HELPER: GET EMPLOYEE ACTIVE LEAD COUNT
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.employee_active_lead_count(p_employee_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT COUNT(*)::int
  FROM app.leads l
  WHERE l.assigned_to = p_employee_id
    AND l.status NOT IN ('converted', 'lost', 'won', 'lose', 'follow_up');
$$;

COMMENT ON FUNCTION app.employee_active_lead_count(UUID) IS
  'Returns the count of active (uncompleted) leads currently assigned to the given employee.';

-- ═══════════════════════════════════════════════════════════════
-- 3. CLAIM TRANSFERABLE LEAD BATCH (MAX BATCH SIZE = 2)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.claim_transferable_lead_batch(
  p_employee_id UUID,
  p_batch_limit INT DEFAULT 2,
  p_business_tz TEXT DEFAULT 'Africa/Cairo'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_tz TEXT;
  v_effective_limit INT;
  v_active_workload INT;
  v_lead_rec RECORD;
  v_claimed_count INT := 0;
  v_prev_owner UUID;
  v_batch_id UUID := gen_random_uuid();
BEGIN
  -- 1. Advisory lock: serialize transfer operations to prevent race conditions & duplicate claims
  PERFORM pg_advisory_xact_lock(7301);

  -- 2. Clean timezone with Africa/Cairo fallback
  v_tz := COALESCE(NULLIF(TRIM(p_business_tz), ''), 'Africa/Cairo');

  -- 3. Strict Admin & Sales Eligibility Check (Admin ALWAYS receives 0)
  IF NOT app.employee_is_eligible_sales(p_employee_id) THEN
    RETURN 0;
  END IF;

  -- 4. Check if claiming employee is active and online
  IF NOT EXISTS (
    SELECT 1 FROM app.employees
    WHERE id = p_employee_id AND is_active = true AND is_online = true
  ) THEN
    RETURN 0;
  END IF;

  -- 5. Active Workload Check (Must have 0 active leads to claim transferable backlog)
  v_active_workload := app.employee_active_lead_count(p_employee_id);
  IF v_active_workload > 0 THEN
    RETURN 0; -- Employee still has active workload to finish!
  END IF;

  -- 6. Enforce batch limit = at most 2
  v_effective_limit := LEAST(2, GREATEST(1, COALESCE(p_batch_limit, 2)));

  -- 7. Mark stale employees as offline (heartbeat > 5 min ago)
  UPDATE app.employees
  SET is_online = false
  WHERE is_online = true
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat < (now() - INTERVAL '5 minutes');

  -- 8. Select transferable leads:
  --    - Currently assigned to an employee other than claiming employee
  --    - Lead status is active (NOT converted, lost, etc.)
  --    - Current owner is OFFLINE (is_online = false OR is_active = false OR stale heartbeat)
  --    - Current owner has NEVER sent an outbound employee message for this lead
  --    - ORDER BY FIFO (oldest received_at/created_at first)
  --    - LIMIT 2 (max batch of 2)
  --    - FOR UPDATE SKIP LOCKED for atomic concurrency
  FOR v_lead_rec IN
    SELECT l.id, l.assigned_to
    FROM app.leads l
    JOIN app.employees owner_emp ON owner_emp.id = l.assigned_to
    WHERE l.assigned_to IS NOT NULL
      AND l.assigned_to <> p_employee_id
      AND l.status NOT IN ('converted', 'lost', 'won', 'lose', 'follow_up')
      AND (
        owner_emp.is_online = false
        OR owner_emp.is_active = false
        OR (owner_emp.last_heartbeat IS NOT NULL AND owner_emp.last_heartbeat < (now() - INTERVAL '5 minutes'))
      )
      AND NOT app.lead_has_outbound_message(l.id)
    ORDER BY COALESCE(l.received_at, l.created_at) ASC, l.id ASC
    LIMIT v_effective_limit
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    v_prev_owner := v_lead_rec.assigned_to;

    -- Update lead assignment
    UPDATE app.leads
    SET assigned_to = p_employee_id,
        assigned_at = now(),
        assignment_source = 'transfer',
        updated_at = now()
    WHERE id = v_lead_rec.id;

    v_claimed_count := v_claimed_count + 1;

    -- Audit Log Entry (Mandatory for compliance)
    INSERT INTO audit.audit_logs (
      actor_id,
      action,
      module,
      entity_type,
      entity_id,
      old_value,
      new_value
    ) VALUES (
      p_employee_id,
      'lead.transferred',
      'crm',
      'lead',
      v_lead_rec.id::text,
      jsonb_build_object(
        'previous_owner', v_prev_owner,
        'reason', 'offline_transferable_backlog'
      ),
      jsonb_build_object(
        'new_owner', p_employee_id,
        'batch_size', v_effective_limit,
        'batch_id', v_batch_id
      )
    );
  END LOOP;

  RETURN v_claimed_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 4. PROCESS TRANSFERABLE LEAD BACKLOG (FAIR ROTATION)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.process_transferable_lead_backlog(
  p_business_tz TEXT DEFAULT 'Africa/Cairo'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_tz TEXT;
  v_emp_rec RECORD;
  v_total_claimed INT := 0;
  v_claimed_in_pass INT;
  v_today DATE;
  v_doy INT;
BEGIN
  PERFORM pg_advisory_xact_lock(7301);

  v_tz := COALESCE(NULLIF(TRIM(p_business_tz), ''), 'Africa/Cairo');
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_doy   := EXTRACT(DOY FROM v_today)::int;

  -- Mark stale employees offline
  UPDATE app.employees
  SET is_online = false
  WHERE is_online = true
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat < (now() - INTERVAL '5 minutes');

  -- Loop over active online eligible sales reps who currently have 0 active leads
  -- Ordered by today's lead count ASC and rotating priority tie-breaker
  FOR v_emp_rec IN
    WITH eligible AS (
      SELECT e.id
      FROM app.employees e
      WHERE e.is_active = true
        AND e.is_online = true
        AND app.employee_is_eligible_sales(e.id)
        AND app.employee_active_lead_count(e.id) = 0
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
    FROM ranked r, total t
    WHERE t.cnt > 0
    ORDER BY
      r.today_count ASC,
      ((r.stable_pos + v_doy) % t.cnt) ASC
  LOOP
    v_claimed_in_pass := app.claim_transferable_lead_batch(v_emp_rec.employee_id, 2, v_tz);
    v_total_claimed := v_total_claimed + v_claimed_in_pass;
  END LOOP;

  RETURN v_total_claimed;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 5. PUBLIC SCHEMA RPC WRAPPERS & GRANTS
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.lead_has_outbound_message(p_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT app.lead_has_outbound_message(p_lead_id);
$$;

CREATE OR REPLACE FUNCTION public.employee_active_lead_count(p_employee_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT app.employee_active_lead_count(p_employee_id);
$$;

CREATE OR REPLACE FUNCTION public.claim_transferable_lead_batch(
  p_employee_id UUID,
  p_batch_limit INT DEFAULT 2,
  p_business_tz TEXT DEFAULT 'Africa/Cairo'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  RETURN app.claim_transferable_lead_batch(p_employee_id, p_batch_limit, p_business_tz);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_transferable_lead_backlog(
  p_business_tz TEXT DEFAULT 'Africa/Cairo'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  RETURN app.process_transferable_lead_backlog(p_business_tz);
END;
$$;

GRANT EXECUTE ON FUNCTION app.lead_has_outbound_message(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.employee_active_lead_count(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.claim_transferable_lead_batch(UUID, INT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.process_transferable_lead_backlog(TEXT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.lead_has_outbound_message(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.employee_active_lead_count(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_transferable_lead_batch(UUID, INT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_transferable_lead_backlog(TEXT) TO authenticated, service_role;
