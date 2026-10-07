-- supabase/migrations/20240101000032_lead_definition_and_distribution.sql
-- Lead Definition & Lead Distribution Rules Implementation:
-- 1. Correct definition: A Lead is an incoming customer conversation/message requiring Sales handling.
-- 2. Server-side Admin exclusion: Admin users must NEVER receive Leads (automatic, fallback, manual, webhook, backlog).
-- 3. Online Sales Available: Assign new Leads ONLY to Online Sales employees (offline reps receive 0).
-- 4. All Sales Offline: Do NOT leave leads unassigned. Distribute incoming Leads fairly among eligible Sales reps even if offline. Admin still receives 0.
-- 5. Lead Ownership & Concurrency: Exactly one Lead Owner at a time, protected by pg_advisory_xact_lock(7301).
-- 6. Offline stability: Existing Leads remain assigned when employee goes offline.
-- 7. Fair distribution: Rotating tie-break logic reusing Cairo business date and today_count.
-- 8. Customer & Conversation Identification in ingest_inbound_message.

-- ═══════════════════════════════════════════════════════════════
-- 1. ELIGIBILITY HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.employee_is_eligible_sales(p_employee_id UUID)
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
  )
  AND NOT EXISTS (
    SELECT 1
    FROM app.user_roles ur
    JOIN app.roles r ON r.id = ur.role_id
    WHERE ur.employee_id = p_employee_id
      AND r.name = 'Admin'
  );
$$;

COMMENT ON FUNCTION app.employee_is_eligible_sales(UUID) IS
  'Returns true IF AND ONLY IF the employee has the Sales role AND does NOT have the Admin role.';

-- Maintain backward-compatibility for existing triggers/callers
CREATE OR REPLACE FUNCTION app.employee_has_sales_role(p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT app.employee_is_eligible_sales(p_employee_id);
$$;

-- Function to query all eligible Sales employees for assignment/dropdowns
CREATE OR REPLACE FUNCTION app.get_eligible_sales_employees()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  is_online BOOLEAN,
  last_heartbeat TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT e.id, e.full_name, e.email, e.is_online, e.last_heartbeat
  FROM app.employees e
  WHERE e.is_active = true
    AND app.employee_is_eligible_sales(e.id)
  ORDER BY e.full_name ASC;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 2. SERVER-SIDE DATABASE CONSTRAINT: ADMIN CAN NEVER BE ASSIGNED LEADS
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.validate_lead_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    IF NOT app.employee_is_eligible_sales(NEW.assigned_to) THEN
      RAISE EXCEPTION 'Lead assignment rejected: Employee % is not an eligible Sales employee or is an Admin.', NEW.assigned_to;
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
-- 3. CORE LEAD ASSIGNMENT ENGINE (RULES 2, 3, 4, 5, 6, 7)
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS app.assign_lead_to_sales(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS app.assign_lead_to_sales(UUID, TEXT);
DROP FUNCTION IF EXISTS public.assign_lead_to_sales(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.assign_lead_to_sales(UUID, TEXT);

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
  v_existing_owner UUID;
  v_assigned_employee_id UUID;
  v_today DATE;
  v_doy INT;
  v_has_online_sales BOOLEAN;
BEGIN
  -- 1. Advisory lock: serialize assignment operations to prevent race conditions
  PERFORM pg_advisory_xact_lock(7301);

  -- 2. Check if lead already has a valid eligible owner (Ownership Stability)
  SELECT assigned_to INTO v_existing_owner
  FROM app.leads
  WHERE id = p_lead_id;

  IF v_existing_owner IS NOT NULL THEN
    IF app.employee_is_eligible_sales(v_existing_owner) THEN
      -- Existing ownership remains intact
      RETURN v_existing_owner;
    END IF;
  END IF;

  -- 3. Mark stale employees as offline (heartbeat > 5 min ago)
  UPDATE app.employees
  SET is_online = false
  WHERE is_online = true
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat < (now() - INTERVAL '5 minutes');

  -- 4. Calculate today's date and day-of-year in business timezone
  v_today := (now() AT TIME ZONE p_business_tz)::date;
  v_doy   := EXTRACT(DOY FROM v_today)::int;

  -- 5. Determine whether any eligible Sales employees are currently ONLINE
  SELECT EXISTS (
    SELECT 1
    FROM app.employees e
    WHERE e.is_active = true
      AND e.is_online = true
      AND app.employee_is_eligible_sales(e.id)
  ) INTO v_has_online_sales;

  -- 6. Select candidate pool:
  --    - If >=1 eligible Sales rep is Online: candidate pool is ONLY Online Sales reps.
  --    - If ALL eligible Sales reps are Offline: candidate pool is ALL active Sales reps.
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

  -- 7. Persist Lead assignment
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

-- ═══════════════════════════════════════════════════════════════
-- 4. PROCESS PENDING BACKLOG LEADS (DRAIN FUNCTION)
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS app.process_pending_unassigned_leads(TEXT, INT);
DROP FUNCTION IF EXISTS app.process_pending_unassigned_leads(TEXT);
DROP FUNCTION IF EXISTS public.process_pending_unassigned_leads(TEXT, INT);
DROP FUNCTION IF EXISTS public.process_pending_unassigned_leads(TEXT);

CREATE OR REPLACE FUNCTION app.process_pending_unassigned_leads(
  p_business_tz TEXT DEFAULT 'Africa/Cairo',
  p_batch_limit INT DEFAULT NULL
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
BEGIN
  -- Acquire transaction advisory lock
  PERFORM pg_advisory_xact_lock(7301);

  -- Drain unassigned active leads in FIFO order
  FOR v_lead_record IN
    SELECT id
    FROM app.leads
    WHERE assigned_to IS NULL
      AND status NOT IN ('converted', 'lost')
    ORDER BY COALESCE(received_at, created_at) ASC
  LOOP
    v_assigned_emp := app.assign_lead_to_sales(v_lead_record.id, p_business_tz);
    IF v_assigned_emp IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 5. ATOMIC INBOUND MESSAGE INGESTION & LEAD RESOLUTION
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.ingest_inbound_message(
  p_raw_event_id UUID,
  p_channel TEXT,
  p_external_sender_id TEXT,
  p_sender_display_name TEXT DEFAULT NULL,
  p_sender_phone TEXT DEFAULT NULL,
  p_external_thread_id TEXT DEFAULT NULL,
  p_external_message_id TEXT DEFAULT NULL,
  p_message_type TEXT DEFAULT 'text',
  p_content TEXT DEFAULT NULL,
  p_media_url TEXT DEFAULT NULL,
  p_business_tz TEXT DEFAULT 'Africa/Cairo'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_effective_thread_id TEXT;
  v_identity_id UUID;
  v_customer_id UUID;
  v_conv_id UUID;
  v_conv_assigned_to UUID;
  v_conv_lead_id UUID;
  v_conv_status TEXT;
  v_conv_unread INT;
  v_conv_customer_id UUID;
  v_lead_id UUID;
  v_lead_status TEXT;
  v_lead_assigned_to UUID;
  v_assigned_emp_id UUID;
  v_message_id UUID;
  v_is_duplicate_msg BOOLEAN := false;
BEGIN
  v_effective_thread_id := COALESCE(p_external_thread_id, p_external_sender_id);

  -- 1. Advisory lock per thread: serializes processing for the exact same customer thread
  PERFORM pg_advisory_xact_lock(hashtext(p_channel || ':' || v_effective_thread_id));

  -- 2. Upsert Channel Identity
  INSERT INTO app.channel_identities (
    channel,
    external_id,
    display_name,
    phone,
    customer_id
  ) VALUES (
    p_channel,
    p_external_sender_id,
    p_sender_display_name,
    p_sender_phone,
    NULL
  )
  ON CONFLICT (channel, external_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, app.channel_identities.display_name),
        phone = COALESCE(EXCLUDED.phone, app.channel_identities.phone),
        updated_at = now()
  RETURNING id, customer_id INTO v_identity_id, v_customer_id;

  -- 3. Customer Identification: if not linked, attempt match by phone in app.customers
  IF v_customer_id IS NULL AND p_sender_phone IS NOT NULL AND p_sender_phone <> '' THEN
    SELECT id INTO v_customer_id
    FROM app.customers
    WHERE phone = p_sender_phone
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_customer_id IS NOT NULL THEN
      UPDATE app.channel_identities
      SET customer_id = v_customer_id,
          updated_at = now()
      WHERE id = v_identity_id;
    END IF;
  END IF;

  -- 4. Upsert Conversation Thread
  INSERT INTO app.conversations (
    channel,
    external_thread_id,
    channel_identity_id,
    customer_id,
    status
  ) VALUES (
    p_channel,
    v_effective_thread_id,
    v_identity_id,
    v_customer_id,
    'open'
  )
  ON CONFLICT (channel, external_thread_id) DO UPDATE
    SET customer_id = COALESCE(app.conversations.customer_id, EXCLUDED.customer_id),
        updated_at = now()
  RETURNING id, assigned_to, status, lead_id, unread_count, customer_id
  INTO v_conv_id, v_conv_assigned_to, v_conv_status, v_conv_lead_id, v_conv_unread, v_conv_customer_id;

  v_customer_id := COALESCE(v_customer_id, v_conv_customer_id);

  -- 5. Lead Identification: check if existing conversation has an active lead
  v_lead_id := v_conv_lead_id;

  IF v_lead_id IS NOT NULL THEN
    SELECT status, assigned_to INTO v_lead_status, v_lead_assigned_to
    FROM app.leads
    WHERE id = v_lead_id;

    IF v_lead_status IS NULL OR v_lead_status IN ('converted', 'lost') THEN
      v_lead_id := NULL; -- Lead was closed/converted, needs fresh lead for new inquiry
    END IF;
  END IF;

  -- If conversation already has an active lead, but lead is unassigned, assign it now
  IF v_lead_id IS NOT NULL AND v_lead_assigned_to IS NULL THEN
    v_assigned_emp_id := app.assign_lead_to_sales(v_lead_id, p_business_tz);
    IF v_assigned_emp_id IS NOT NULL THEN
      v_conv_assigned_to := v_assigned_emp_id;
      v_conv_status := 'open';
      UPDATE app.conversations
      SET assigned_to = v_conv_assigned_to,
          status = v_conv_status,
          updated_at = now()
      WHERE id = v_conv_id;
    END IF;
  END IF;

  -- 6. Create new Lead IF no active lead exists for this conversation
  IF v_lead_id IS NULL THEN
    INSERT INTO app.leads (
      full_name,
      notes,
      phone,
      email,
      status,
      source,
      assignment_source,
      received_at
    ) VALUES (
      COALESCE(p_sender_display_name, p_sender_phone, p_external_sender_id),
      CASE WHEN p_content IS NOT NULL AND p_content <> '' THEN 'Initial message: ' || p_content ELSE NULL END,
      p_sender_phone,
      CASE WHEN p_sender_phone IS NULL THEN p_external_sender_id || '@messenger.meta.test' ELSE NULL END,
      'new',
      CASE WHEN p_channel = 'whatsapp' THEN 'whatsapp' ELSE 'social_media' END,
      'unassigned',
      now()
    )
    RETURNING id INTO v_lead_id;

    -- Call authoritative lead assignment engine
    v_assigned_emp_id := app.assign_lead_to_sales(v_lead_id, p_business_tz);

    IF v_assigned_emp_id IS NOT NULL THEN
      v_conv_assigned_to := v_assigned_emp_id;
      v_conv_status := 'open';
    ELSE
      v_conv_assigned_to := NULL;
      v_conv_status := 'pending_assignment';
    END IF;

    -- Update conversation record with lead and assignment
    UPDATE app.conversations
    SET lead_id = v_lead_id,
        assigned_to = v_conv_assigned_to,
        status = v_conv_status,
        updated_at = now()
    WHERE id = v_conv_id;

    -- Record audit log for lead assignment
    IF v_assigned_emp_id IS NOT NULL THEN
      INSERT INTO audit.audit_logs (
        actor_id,
        action,
        module,
        entity_type,
        entity_id,
        new_value
      ) VALUES (
        v_assigned_emp_id,
        'lead.assigned',
        'crm',
        'lead',
        v_lead_id::text,
        jsonb_build_object(
          'assigned_to', v_assigned_emp_id,
          'channel', p_channel,
          'conversation_id', v_conv_id
        )
      );
    END IF;
  END IF;

  -- 7. Insert Message (Idempotent by external_message_id)
  IF p_external_message_id IS NOT NULL THEN
    SELECT id INTO v_message_id
    FROM app.messages
    WHERE conversation_id = v_conv_id
      AND external_message_id = p_external_message_id;

    IF v_message_id IS NOT NULL THEN
      v_is_duplicate_msg := true;
    END IF;
  END IF;

  IF NOT v_is_duplicate_msg THEN
    INSERT INTO app.messages (
      conversation_id,
      raw_event_id,
      direction,
      sender_type,
      external_message_id,
      message_type,
      content,
      media_url,
      status,
      received_at
    ) VALUES (
      v_conv_id,
      p_raw_event_id,
      'inbound',
      'contact',
      p_external_message_id,
      COALESCE(p_message_type, 'text'),
      p_content,
      p_media_url,
      'received',
      now()
    )
    ON CONFLICT (conversation_id, external_message_id) WHERE external_message_id IS NOT NULL
    DO UPDATE SET updated_at = app.messages.updated_at
    RETURNING id INTO v_message_id;

    -- Update conversation last message details and increment unread count
    UPDATE app.conversations
    SET last_message_at = now(),
        last_message_preview = SUBSTRING(COALESCE(p_content, '') FROM 1 FOR 100),
        unread_count = COALESCE(unread_count, 0) + 1,
        updated_at = now()
    WHERE id = v_conv_id;
  END IF;

  -- 8. Mark raw event as processed
  IF p_raw_event_id IS NOT NULL THEN
    UPDATE app.webhook_events
    SET status = 'processed',
        processed_at = now()
    WHERE id = p_raw_event_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'conversation_id', v_conv_id,
    'customer_id', v_customer_id,
    'message_id', v_message_id,
    'lead_id', v_lead_id,
    'assigned_to', v_conv_assigned_to,
    'status', v_conv_status,
    'is_duplicate_message', v_is_duplicate_msg
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 6. PUBLIC SCHEMA RPC WRAPPERS & GRANTS
-- ═══════════════════════════════════════════════════════════════

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

CREATE OR REPLACE FUNCTION public.process_pending_unassigned_leads(
  p_business_tz TEXT DEFAULT 'Africa/Cairo',
  p_batch_limit INT DEFAULT NULL
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

CREATE OR REPLACE FUNCTION public.employee_is_eligible_sales(p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT app.employee_is_eligible_sales(p_employee_id);
$$;

CREATE OR REPLACE FUNCTION public.get_eligible_sales_employees()
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  is_online BOOLEAN,
  last_heartbeat TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT * FROM app.get_eligible_sales_employees();
$$;

GRANT EXECUTE ON FUNCTION app.employee_is_eligible_sales(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.get_eligible_sales_employees() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.assign_lead_to_sales(UUID, TEXT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.process_pending_unassigned_leads(TEXT, INT) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.employee_is_eligible_sales(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_eligible_sales_employees() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_lead_to_sales(UUID, TEXT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_pending_unassigned_leads(TEXT, INT) TO authenticated, service_role;
