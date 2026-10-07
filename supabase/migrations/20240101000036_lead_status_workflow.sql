-- supabase/migrations/20240101000036_lead_status_workflow.sql
-- Lead Status Workflow Migration:
-- 1. Canonical Lead statuses: in_progress, follow_up, won, lose
-- 2. Follow-up fields: follow_up_at, follow_up_notification_sent_at
-- 3. Lead status history audit table: app.lead_status_history
-- 4. Authoritative status change function: app.change_lead_status
-- 5. DB-backed notification system: app.notifications & app.process_follow_up_reminders
-- 6. Outbound employee message trigger: follow_up -> in_progress
-- 7. Distribution & offline-transfer integration updates

-- ═══════════════════════════════════════════════════════════════
-- 1. MIGRATE EXISTING STATUS VALUES & ADD FOLLOW-UP COLUMNS
-- ═══════════════════════════════════════════════════════════════

-- Add follow-up tracking columns to app.leads
ALTER TABLE app.leads
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_notification_sent_at TIMESTAMPTZ;

-- Drop old check constraint on status before updating rows
ALTER TABLE app.leads
  DROP CONSTRAINT IF EXISTS leads_status_check;

-- Safe legacy status migration:
-- 'new', 'contacted', 'open' -> 'in_progress'
-- 'converted' -> 'won'
-- 'lost', 'closed', 'archive' -> 'lose'
UPDATE app.leads
SET status = 'in_progress'
WHERE status IN ('new', 'contacted', 'open');

UPDATE app.leads
SET status = 'won'
WHERE status IN ('converted');

UPDATE app.leads
SET status = 'lose'
WHERE status IN ('lost', 'closed', 'archive');

-- Ensure any unexpected or fallback status is normalized
UPDATE app.leads
SET status = 'in_progress'
WHERE status NOT IN ('in_progress', 'follow_up', 'won', 'lose');

-- Set default to 'in_progress'
ALTER TABLE app.leads
  ALTER COLUMN status SET DEFAULT 'in_progress';

-- Add canonical status check constraint
ALTER TABLE app.leads
  ADD CONSTRAINT leads_status_check
  CHECK (status IN ('in_progress', 'follow_up', 'won', 'lose'));

-- Add follow-up consistency check constraint:
-- follow_up status requires follow_up_at NOT NULL.
-- other statuses require follow_up_at IS NULL.
ALTER TABLE app.leads
  DROP CONSTRAINT IF EXISTS leads_follow_up_check;

ALTER TABLE app.leads
  ADD CONSTRAINT leads_follow_up_check
  CHECK (
    (status = 'follow_up' AND follow_up_at IS NOT NULL) OR
    (status <> 'follow_up' AND follow_up_at IS NULL)
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_follow_up_reminders
  ON app.leads (follow_up_at)
  WHERE status = 'follow_up' AND follow_up_notification_sent_at IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. LEAD STATUS HISTORY TABLE (APPEND-ONLY AUDIT)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app.lead_status_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES app.leads(id) ON DELETE CASCADE,
  changed_by    UUID REFERENCES app.employees(id) ON DELETE SET NULL,
  old_status    TEXT,
  new_status    TEXT NOT NULL,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  follow_up_at  TIMESTAMPTZ,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_lead_status_history_lead
  ON app.lead_status_history(lead_id, changed_at DESC);

GRANT SELECT, INSERT ON app.lead_status_history TO authenticated;
GRANT ALL ON app.lead_status_history TO service_role;

ALTER TABLE app.lead_status_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'app' AND tablename = 'lead_status_history' AND policyname = 'lead_status_history_select_policy'
  ) THEN
    CREATE POLICY lead_status_history_select_policy ON app.lead_status_history
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'app' AND tablename = 'lead_status_history' AND policyname = 'lead_status_history_insert_policy'
  ) THEN
    CREATE POLICY lead_status_history_insert_policy ON app.lead_status_history
      FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 3. INTERNAL NOTIFICATIONS TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'follow_up_reminder',
  entity_type  TEXT NOT NULL DEFAULT 'lead',
  entity_id    UUID REFERENCES app.leads(id) ON DELETE CASCADE,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_emp
  ON app.notifications(employee_id, is_read, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON app.notifications TO authenticated;
GRANT ALL ON app.notifications TO service_role;

ALTER TABLE app.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'app' AND tablename = 'notifications' AND policyname = 'notifications_select_policy'
  ) THEN
    CREATE POLICY notifications_select_policy ON app.notifications
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'app' AND tablename = 'notifications' AND policyname = 'notifications_insert_policy'
  ) THEN
    CREATE POLICY notifications_insert_policy ON app.notifications
      FOR INSERT TO authenticated
      WITH CHECK (true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 4. AUTHORITATIVE STATUS CHANGE FUNCTION
-- ═══════════════════════════════════════════════════════════════

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
        SELECT 1 FROM app.employee_roles er
        JOIN app.roles r ON r.id = er.role_id
        WHERE er.employee_id = p_changed_by AND r.name = 'Admin'
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

CREATE OR REPLACE FUNCTION public.change_lead_status(
  p_lead_id UUID,
  p_new_status TEXT,
  p_changed_by UUID DEFAULT NULL,
  p_follow_up_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_res app.leads%ROWTYPE;
BEGIN
  v_res := app.change_lead_status(p_lead_id, p_new_status, p_changed_by, p_follow_up_at, p_notes);
  RETURN to_jsonb(v_res);
END;
$$;

GRANT EXECUTE ON FUNCTION app.change_lead_status(UUID, TEXT, UUID, TIMESTAMPTZ, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.change_lead_status(UUID, TEXT, UUID, TIMESTAMPTZ, TEXT) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════
-- 5. FOLLOW-UP REMINDER WORKER FUNCTION
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.process_follow_up_reminders()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_lead_rec RECORD;
  v_count INT := 0;
BEGIN
  -- Concurrency-safe claim using FOR UPDATE SKIP LOCKED
  FOR v_lead_rec IN
    SELECT l.id, l.assigned_to, l.full_name, l.follow_up_at
    FROM app.leads l
    WHERE l.status = 'follow_up'
      AND l.follow_up_at IS NOT NULL
      AND l.follow_up_at <= now()
      AND l.follow_up_notification_sent_at IS NULL
      AND l.assigned_to IS NOT NULL
    ORDER BY l.follow_up_at ASC
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    -- Mark notification as sent atomically
    UPDATE app.leads
    SET follow_up_notification_sent_at = now()
    WHERE id = v_lead_rec.id;

    -- Create internal notification record
    INSERT INTO app.notifications (
      employee_id,
      title,
      message,
      type,
      entity_type,
      entity_id,
      created_at
    ) VALUES (
      v_lead_rec.assigned_to,
      'Follow-Up Reminder',
      'Follow-up time reached for lead: ' || v_lead_rec.full_name,
      'follow_up_reminder',
      'lead',
      v_lead_rec.id,
      now()
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_follow_up_reminders()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  RETURN app.process_follow_up_reminders();
END;
$$;

GRANT EXECUTE ON FUNCTION app.process_follow_up_reminders() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_follow_up_reminders() TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════
-- 6. OUTBOUND MESSAGE TRIGGER: follow_up -> in_progress
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.trg_fn_outbound_msg_reopen_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_lead_id UUID;
  v_lead_status TEXT;
  v_lead_owner UUID;
BEGIN
  -- Only trigger when message is outbound, from an employee, and status is 'sent'
  IF NEW.direction = 'outbound'
     AND NEW.sender_type = 'employee'
     AND NEW.status = 'sent'
     AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM 'sent' OR OLD.direction IS DISTINCT FROM 'outbound'))) THEN

    SELECT c.lead_id, l.status, l.assigned_to
    INTO v_lead_id, v_lead_status, v_lead_owner
    FROM app.conversations c
    JOIN app.leads l ON l.id = c.lead_id
    WHERE c.id = NEW.conversation_id;

    -- Only transition if lead is currently in follow_up and sender is the current lead owner
    IF v_lead_id IS NOT NULL
       AND v_lead_status = 'follow_up'
       AND v_lead_owner IS NOT NULL
       AND v_lead_owner = NEW.sender_employee_id THEN

      PERFORM app.change_lead_status(
        v_lead_id,
        'in_progress',
        NEW.sender_employee_id,
        NULL,
        'Reopened from follow_up due to outbound customer message'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_outbound_msg_reopen_lead ON app.messages;
CREATE TRIGGER trg_outbound_msg_reopen_lead
  AFTER INSERT OR UPDATE OF status, direction ON app.messages
  FOR EACH ROW
  EXECUTE FUNCTION app.trg_fn_outbound_msg_reopen_lead();

-- ═══════════════════════════════════════════════════════════════
-- 7. RE-ALIGN HELPER & TRANSFER FUNCTIONS WITH CANONICAL STATUSES
-- ═══════════════════════════════════════════════════════════════

-- Employee active lead count (ONLY 'in_progress' counts as active)
CREATE OR REPLACE FUNCTION app.employee_active_lead_count(p_employee_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT COUNT(*)::INT
  FROM app.leads l
  WHERE l.assigned_to = p_employee_id
    AND l.status = 'in_progress';
$$;

-- Claim transferable lead batch (ONLY 'in_progress' is transferable)
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
  v_effective_limit INT;
  v_claimed_count INT := 0;
  v_active_workload INT;
  v_lead_rec RECORD;
  v_prev_owner UUID;
  v_batch_id UUID := gen_random_uuid();
BEGIN
  -- 1. Batch size limit strictly <= 2
  v_effective_limit := LEAST(2, GREATEST(1, COALESCE(p_batch_limit, 2)));

  -- 2. Admin Exclusion: Admin can NEVER claim or receive leads
  IF NOT app.employee_is_eligible_sales(p_employee_id) THEN
    RETURN 0;
  END IF;

  -- 3. Online Check
  IF NOT EXISTS (
    SELECT 1 FROM app.employees e
    WHERE e.id = p_employee_id
      AND e.is_active = true
      AND e.is_online = true
      AND (e.last_heartbeat IS NULL OR e.last_heartbeat >= (now() - INTERVAL '5 minutes'))
  ) THEN
    RETURN 0;
  END IF;

  -- 4. Workload Priority: employee must have 0 active leads
  v_active_workload := app.employee_active_lead_count(p_employee_id);
  IF v_active_workload > 0 THEN
    RETURN 0;
  END IF;

  -- 5. Lock and claim transferable leads in FIFO order
  FOR v_lead_rec IN
    SELECT l.id, l.assigned_to, l.received_at, l.created_at
    FROM app.leads l
    JOIN app.employees owner ON owner.id = l.assigned_to
    WHERE l.assigned_to IS NOT NULL
      AND (
        owner.is_online = false
        OR owner.is_active = false
        OR owner.last_heartbeat < (now() - INTERVAL '5 minutes')
      )
      AND l.status = 'in_progress'
      AND NOT app.lead_has_outbound_message(l.id)
    ORDER BY COALESCE(l.received_at, l.created_at) ASC, l.id ASC
    FOR UPDATE OF l SKIP LOCKED
    LIMIT v_effective_limit
  LOOP
    v_prev_owner := v_lead_rec.assigned_to;

    -- Update lead assignment
    UPDATE app.leads
    SET assigned_to = p_employee_id,
        assigned_at = now(),
        assignment_source = 'transfer',
        updated_at = now()
    WHERE id = v_lead_rec.id;

    -- Update conversation assignment
    UPDATE app.conversations
    SET assigned_to = p_employee_id,
        updated_at = now()
    WHERE lead_id = v_lead_rec.id;

    -- Audit log
    INSERT INTO audit.audit_logs (
      actor_id,
      action,
      module,
      entity_type,
      entity_id,
      new_value
    ) VALUES (
      p_employee_id,
      'lead.transferred',
      'crm',
      'lead',
      v_lead_rec.id::text,
      jsonb_build_object(
        'lead_id', v_lead_rec.id,
        'previous_owner', v_prev_owner,
        'new_owner', p_employee_id,
        'transferred_at', now(),
        'reason', 'offline_transferable_batch',
        'batch_id', v_batch_id,
        'batch_limit', v_effective_limit
      )
    );

    v_claimed_count := v_claimed_count + 1;
  END LOOP;

  RETURN v_claimed_count;
END;
$$;

-- Process pending unassigned leads
CREATE OR REPLACE FUNCTION app.process_pending_unassigned_leads(
  p_business_tz TEXT DEFAULT 'Africa/Cairo',
  p_batch_limit INT DEFAULT 2
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_lead_record RECORD;
  v_assigned_emp UUID;
  v_drained_count INT := 0;
  v_effective_batch_limit INT;
BEGIN
  v_effective_batch_limit := LEAST(2, GREATEST(1, COALESCE(p_batch_limit, 2)));

  IF NOT EXISTS (
    SELECT 1 FROM app.employees e
    LEFT JOIN (
      SELECT l.assigned_to, COUNT(*) AS active_backlog_count
      FROM app.leads l
      WHERE l.assigned_to IS NOT NULL
        AND l.status = 'in_progress'
      GROUP BY l.assigned_to
    ) ab ON ab.assigned_to = e.id
    WHERE e.is_active = true
      AND e.is_online = true
      AND app.employee_is_eligible_sales(e.id)
      AND COALESCE(ab.active_backlog_count, 0) < v_effective_batch_limit
  ) THEN
    RETURN 0;
  END IF;

  FOR v_lead_record IN (
    SELECT id
    FROM app.leads
    WHERE assigned_to IS NULL
      AND assignment_source = 'unassigned'
      AND status = 'in_progress'
    ORDER BY received_at ASC, created_at ASC
  ) LOOP
    v_assigned_emp := app.assign_lead_to_sales(v_lead_record.id, p_business_tz, v_effective_batch_limit);

    IF v_assigned_emp IS NOT NULL THEN
      UPDATE app.conversations
      SET assigned_to = v_assigned_emp,
          status = 'open',
          updated_at = now()
      WHERE lead_id = v_lead_record.id;

      v_drained_count := v_drained_count + 1;
    END IF;
  END LOOP;

  RETURN v_drained_count;
END;
$$;

-- Ingest inbound message atomic: new leads created with status 'in_progress'
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
  v_identity_id UUID;
  v_customer_id UUID;
  v_conv_id UUID;
  v_conv_assigned_to UUID;
  v_conv_status TEXT;
  v_conv_lead_id UUID;
  v_conv_unread INT;
  v_conv_customer_id UUID;
  v_lead_id UUID;
  v_lead_status TEXT;
  v_lead_assigned_to UUID;
  v_msg_id UUID;
  v_assigned_emp_id UUID;
  v_effective_thread_id TEXT;
  v_is_new_message BOOLEAN := false;
BEGIN
  -- 1. Idempotency Check on external_message_id
  IF p_external_message_id IS NOT NULL THEN
    SELECT m.id, m.conversation_id, c.lead_id
    INTO v_msg_id, v_conv_id, v_lead_id
    FROM app.messages m
    JOIN app.conversations c ON c.id = m.conversation_id
    WHERE m.external_message_id = p_external_message_id;

    IF v_msg_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'message_id', v_msg_id,
        'conversation_id', v_conv_id,
        'lead_id', v_lead_id,
        'is_duplicate', true
      );
    END IF;
  END IF;

  v_effective_thread_id := COALESCE(p_external_thread_id, p_external_sender_id);

  -- 2. Upsert Channel Identity
  INSERT INTO app.channel_identities (
    channel,
    external_id,
    display_name,
    phone
  ) VALUES (
    p_channel,
    p_external_sender_id,
    p_sender_display_name,
    p_sender_phone
  )
  ON CONFLICT (channel, external_id) DO UPDATE
    SET display_name = COALESCE(EXCLUDED.display_name, app.channel_identities.display_name),
        phone = COALESCE(EXCLUDED.phone, app.channel_identities.phone),
        updated_at = now()
  RETURNING id, customer_id INTO v_identity_id, v_customer_id;

  -- 3. Customer Identification
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

    -- Re-inquiry when previous lead was closed/won/lost creates a NEW fresh lead
    IF v_lead_status IS NULL OR v_lead_status IN ('won', 'lose', 'converted', 'lost') THEN
      v_lead_id := NULL;
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
      'in_progress',
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

  -- 7. Insert Message
  IF p_external_message_id IS NOT NULL THEN
    INSERT INTO app.messages (
      conversation_id,
      direction,
      sender_type,
      sender_employee_id,
      content,
      media_url,
      message_type,
      external_message_id,
      status,
      sent_at
    ) VALUES (
      v_conv_id,
      'inbound',
      'customer',
      NULL,
      p_content,
      p_media_url,
      p_message_type,
      p_external_message_id,
      'delivered',
      now()
    )
    ON CONFLICT (external_message_id) DO NOTHING
    RETURNING id INTO v_msg_id;

    IF v_msg_id IS NOT NULL THEN
      v_is_new_message := true;
    ELSE
      SELECT id INTO v_msg_id
      FROM app.messages
      WHERE external_message_id = p_external_message_id;
    END IF;
  ELSE
    INSERT INTO app.messages (
      conversation_id,
      direction,
      sender_type,
      content,
      media_url,
      message_type,
      status,
      sent_at
    ) VALUES (
      v_conv_id,
      'inbound',
      'customer',
      p_content,
      p_media_url,
      p_message_type,
      'delivered',
      now()
    )
    RETURNING id INTO v_msg_id;
    v_is_new_message := true;
  END IF;

  -- 8. Update conversation last message details & unread count
  IF v_is_new_message THEN
    UPDATE app.conversations
    SET unread_count = COALESCE(unread_count, 0) + 1,
        last_message_at = now(),
        last_message_preview = SUBSTRING(COALESCE(p_content, '[Media]') FROM 1 FOR 100),
        updated_at = now()
    WHERE id = v_conv_id;
  END IF;

  RETURN jsonb_build_object(
    'message_id', v_msg_id,
    'conversation_id', v_conv_id,
    'lead_id', v_lead_id,
    'assigned_to', v_conv_assigned_to,
    'is_duplicate', false
  );
END;
$$;
