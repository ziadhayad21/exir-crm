-- supabase/migrations/20240101000022_create_messaging_inbox.sql
-- Phase 4A: Unified Inbox & Messaging Foundation
-- Creates raw webhook events, channel identities, conversations, messages,
-- additive received_at to leads, Behavior B RLS, RBAC, and deterministic backlog routing.

-- ═══════════════════════════════════════════════════════════════
-- 1. ADDITIVE COLUMN TO LEADS (received_at)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE app.leads
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE app.leads
SET received_at = created_at
WHERE received_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_received_at ON app.leads(received_at);

-- ═══════════════════════════════════════════════════════════════
-- 2. MESSAGING FOUNDATION TABLES
-- ═══════════════════════════════════════════════════════════════

-- 2.1 Raw Webhook Events (Ingestion & Idempotency)
CREATE TABLE IF NOT EXISTS app.webhook_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel        TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'mock', 'other')),
  event_id       TEXT,
  payload        JSONB NOT NULL,
  headers        JSONB,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'ignored')),
  error_message  TEXT,
  retry_count    INT NOT NULL DEFAULT 0,
  processed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status_created ON app.webhook_events(status, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_channel_event ON app.webhook_events(channel, event_id) WHERE event_id IS NOT NULL;

-- 2.2 Customer Channel Identities (Platform Handles)
CREATE TABLE IF NOT EXISTS app.channel_identities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID REFERENCES app.customers(id) ON DELETE SET NULL,
  channel      TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'mock', 'other')),
  external_id  TEXT NOT NULL,
  display_name TEXT,
  phone        TEXT,
  email        TEXT,
  avatar_url   TEXT,
  metadata     JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_channel_identities_channel_ext UNIQUE (channel, external_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_identities_customer ON app.channel_identities(customer_id);
CREATE INDEX IF NOT EXISTS idx_channel_identities_phone ON app.channel_identities(phone) WHERE phone IS NOT NULL;

-- 2.3 Conversations (Unified Chat Threads)
CREATE TABLE IF NOT EXISTS app.conversations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel               TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'messenger', 'mock', 'other')),
  external_thread_id    TEXT NOT NULL,
  channel_identity_id   UUID NOT NULL REFERENCES app.channel_identities(id) ON DELETE CASCADE,
  customer_id           UUID REFERENCES app.customers(id) ON DELETE SET NULL,
  lead_id               UUID REFERENCES app.leads(id) ON DELETE SET NULL,
  assigned_to           UUID REFERENCES app.employees(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'pending_assignment', 'closed', 'archived')),
  unread_count          INT NOT NULL DEFAULT 0,
  last_message_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_conversations_channel_thread UNIQUE (channel, external_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON app.conversations(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON app.conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_lead ON app.conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON app.conversations(status);

-- 2.4 Messages (Unified Thread Records)
CREATE TABLE IF NOT EXISTS app.messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL REFERENCES app.conversations(id) ON DELETE CASCADE,
  raw_event_id        UUID REFERENCES app.webhook_events(id) ON DELETE SET NULL,
  direction           TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type         TEXT NOT NULL CHECK (sender_type IN ('contact', 'employee', 'system', 'bot')),
  sender_employee_id  UUID REFERENCES app.employees(id) ON DELETE SET NULL,
  external_message_id TEXT,
  message_type        TEXT NOT NULL DEFAULT 'text'
                        CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'location', 'template', 'system')),
  content             TEXT,
  media_url           TEXT,
  status              TEXT NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received', 'sending', 'sent', 'delivered', 'read', 'failed')),
  error_detail        TEXT,
  sent_at             TIMESTAMPTZ,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON app.messages(conversation_id, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_ext_id ON app.messages(conversation_id, external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_raw_event ON app.messages(raw_event_id);

-- ═══════════════════════════════════════════════════════════════
-- 3. RE-DEFINE LEAD ASSIGNMENT FUNCTION WITH received_at SEMANTICS
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.assign_lead_to_sales(
  p_lead_id UUID,
  p_business_tz TEXT DEFAULT 'Africa/Cairo'
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
BEGIN
  -- Concurrency lock: serialize assignment operations
  PERFORM pg_advisory_xact_lock(7301);

  -- Step 0: Mark stale employees as offline (heartbeat > 5 min ago)
  UPDATE app.employees
  SET is_online = false
  WHERE is_online = true
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat < (now() - INTERVAL '5 minutes');

  -- Step 1: Calculate today's date in business timezone
  v_today := (now() AT TIME ZONE p_business_tz)::date;
  v_doy   := EXTRACT(DOY FROM v_today)::int;

  -- Step 2: Eligible sales employees with lowest lead count received today
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

-- ═══════════════════════════════════════════════════════════════
-- 4. DETERMINISTIC BACKLOG DRAINAGE FUNCTION
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.process_pending_unassigned_leads(
  p_business_tz TEXT DEFAULT 'Africa/Cairo'
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
  -- 1. Acquire transaction advisory lock to serialize with assignment RPC
  PERFORM pg_advisory_xact_lock(7301);

  -- 2. Mark stale employees as offline (heartbeat > 5 min ago)
  UPDATE app.employees
  SET is_online = false
  WHERE is_online = true
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat < (now() - INTERVAL '5 minutes');

  -- 3. Verify at least one eligible Sales employee is currently online and active
  IF NOT EXISTS (
    SELECT 1 FROM app.employees e
    WHERE e.is_active = true
      AND e.is_online = true
      AND app.employee_has_sales_role(e.id)
  ) THEN
    RETURN 0;
  END IF;

  -- 4. Iterate over pending leads in strict FIFO order (oldest received_at first)
  -- Each lead is evaluated dynamically through the authoritative assign_lead_to_sales function
  FOR v_lead_record IN (
    SELECT id
    FROM app.leads
    WHERE assigned_to IS NULL
      AND assignment_source = 'unassigned'
      AND status = 'new'
    ORDER BY received_at ASC, created_at ASC
  ) LOOP
    v_assigned_emp := app.assign_lead_to_sales(v_lead_record.id, p_business_tz);

    IF v_assigned_emp IS NOT NULL THEN
      -- Sync conversation status and assignment (never reassigning already assigned conversations)
      UPDATE app.conversations
      SET assigned_to = v_assigned_emp,
          status = 'open',
          updated_at = now()
      WHERE lead_id = v_lead_record.id
        AND assigned_to IS NULL;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION app.process_pending_unassigned_leads(TEXT) IS
  'Drains unassigned backlog leads in FIFO order and assigns them fairly across currently online sales reps using Phase 3 rules.';

-- 4.1 Trigger to drain pending backlog leads whenever an employee comes online
CREATE OR REPLACE FUNCTION app.trigger_process_pending_leads_on_online()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  IF NEW.is_online = true AND (OLD.is_online IS DISTINCT FROM true) THEN
    IF app.employee_has_sales_role(NEW.id) THEN
      PERFORM app.process_pending_unassigned_leads('Africa/Cairo');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_online_pending_leads ON app.employees;
CREATE TRIGGER trg_employee_online_pending_leads
  AFTER UPDATE OF is_online ON app.employees
  FOR EACH ROW
  EXECUTE FUNCTION app.trigger_process_pending_leads_on_online();

-- ═══════════════════════════════════════════════════════════════
-- 5. RBAC PERMISSIONS FOR MESSAGING INBOX
-- ═══════════════════════════════════════════════════════════════

INSERT INTO app.permissions (id, key, description, module) VALUES
  ('b0000000-0000-0000-0000-000000000201', 'crm.inbox.read_own', 'View own assigned conversations and messages',           'crm'),
  ('b0000000-0000-0000-0000-000000000202', 'crm.inbox.read_all', 'View all conversations and messages across all channels', 'crm'),
  ('b0000000-0000-0000-0000-000000000203', 'crm.inbox.write',    'Send replies and update conversation status',              'crm')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  module = EXCLUDED.module;

-- Admin role gets all inbox permissions
INSERT INTO app.role_permissions (role_id, permission_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000201'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000202'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000203')
ON CONFLICT DO NOTHING;

-- Sales role gets read_own and write ONLY (NO crm.inbox.read_all)
INSERT INTO app.role_permissions (role_id, permission_id) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000201'),
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000203')
ON CONFLICT DO NOTHING;

-- Accountant and HR receive ZERO inbox permissions (Strictly enforced)

-- ═══════════════════════════════════════════════════════════════
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ═══════════════════════════════════════════════════════════════

-- 6.1 Webhook Events (Service role only)
ALTER TABLE app.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_events_service_role ON app.webhook_events;
CREATE POLICY webhook_events_service_role ON app.webhook_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 6.2 Channel Identities
ALTER TABLE app.channel_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_identities_select ON app.channel_identities;
CREATE POLICY channel_identities_select ON app.channel_identities
  FOR SELECT TO authenticated
  USING (
    app.has_permission('crm.inbox.read_own')
    OR app.has_permission('crm.inbox.read_all')
  );

DROP POLICY IF EXISTS channel_identities_update ON app.channel_identities;
CREATE POLICY channel_identities_update ON app.channel_identities
  FOR UPDATE TO authenticated
  USING (
    app.has_permission('crm.inbox.write')
  )
  WITH CHECK (
    app.has_permission('crm.inbox.write')
  );

DROP POLICY IF EXISTS channel_identities_service_role ON app.channel_identities;
CREATE POLICY channel_identities_service_role ON app.channel_identities
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 6.3 Conversations — ENFORCING BEHAVIOR B
-- Behavior B: Sales reps see ONLY their own assigned conversations.
-- Pending/unassigned conversations are visible exclusively to Admin.
ALTER TABLE app.conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_select_own ON app.conversations;
CREATE POLICY conversations_select_own ON app.conversations
  FOR SELECT TO authenticated
  USING (
    assigned_to = app.get_current_employee_id()
    AND app.has_permission('crm.inbox.read_own')
  );

DROP POLICY IF EXISTS conversations_select_all ON app.conversations;
CREATE POLICY conversations_select_all ON app.conversations
  FOR SELECT TO authenticated
  USING (
    app.has_permission('crm.inbox.read_all')
  );

DROP POLICY IF EXISTS conversations_update_own ON app.conversations;
CREATE POLICY conversations_update_own ON app.conversations
  FOR UPDATE TO authenticated
  USING (
    assigned_to = app.get_current_employee_id()
    AND app.has_permission('crm.inbox.write')
  )
  WITH CHECK (
    assigned_to = app.get_current_employee_id()
    AND app.has_permission('crm.inbox.write')
  );

DROP POLICY IF EXISTS conversations_update_all ON app.conversations;
CREATE POLICY conversations_update_all ON app.conversations
  FOR UPDATE TO authenticated
  USING (
    app.has_permission('crm.inbox.read_all')
    AND app.has_permission('crm.inbox.write')
  )
  WITH CHECK (
    app.has_permission('crm.inbox.write')
  );

DROP POLICY IF EXISTS conversations_service_role ON app.conversations;
CREATE POLICY conversations_service_role ON app.conversations
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 6.4 Messages
ALTER TABLE app.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_select_own ON app.messages;
CREATE POLICY messages_select_own ON app.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app.conversations c
      WHERE c.id = app.messages.conversation_id
        AND c.assigned_to = app.get_current_employee_id()
    )
    AND app.has_permission('crm.inbox.read_own')
  );

DROP POLICY IF EXISTS messages_select_all ON app.messages;
CREATE POLICY messages_select_all ON app.messages
  FOR SELECT TO authenticated
  USING (
    app.has_permission('crm.inbox.read_all')
  );

DROP POLICY IF EXISTS messages_insert_own ON app.messages;
CREATE POLICY messages_insert_own ON app.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app.conversations c
      WHERE c.id = app.messages.conversation_id
        AND c.assigned_to = app.get_current_employee_id()
    )
    AND app.has_permission('crm.inbox.write')
    AND direction = 'outbound'
  );

DROP POLICY IF EXISTS messages_insert_all ON app.messages;
CREATE POLICY messages_insert_all ON app.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    app.has_permission('crm.inbox.read_all')
    AND app.has_permission('crm.inbox.write')
  );

DROP POLICY IF EXISTS messages_service_role ON app.messages;
CREATE POLICY messages_service_role ON app.messages
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 7. PUBLIC SCHEMA VIEWS WITH SECURITY INVOKER
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.leads WITH (security_invoker = true) AS
  SELECT * FROM app.leads;

CREATE OR REPLACE VIEW public.webhook_events WITH (security_invoker = true) AS
  SELECT * FROM app.webhook_events;

CREATE OR REPLACE VIEW public.channel_identities WITH (security_invoker = true) AS
  SELECT * FROM app.channel_identities;

CREATE OR REPLACE VIEW public.conversations WITH (security_invoker = true) AS
  SELECT * FROM app.conversations;

CREATE OR REPLACE VIEW public.messages WITH (security_invoker = true) AS
  SELECT * FROM app.messages;

-- Grants on app schema base tables (required for security_invoker = true views)
GRANT ALL ON app.leads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.leads TO authenticated;

GRANT ALL ON app.webhook_events TO service_role;
GRANT ALL ON app.channel_identities TO service_role;
GRANT ALL ON app.conversations TO service_role;
GRANT ALL ON app.messages TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON app.channel_identities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.messages TO authenticated;

-- Grants on public views
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated, service_role;
GRANT ALL ON public.webhook_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_identities TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated, service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- 8. EXPOSE BACKLOG DRAINAGE RPC TO PUBLIC
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.process_pending_unassigned_leads(
  p_business_tz TEXT DEFAULT 'Africa/Cairo'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  RETURN app.process_pending_unassigned_leads(p_business_tz);
END;
$$;

REVOKE ALL ON FUNCTION public.process_pending_unassigned_leads(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_pending_unassigned_leads(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION app.process_pending_unassigned_leads(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.process_pending_unassigned_leads(TEXT) TO authenticated, service_role;
