-- supabase/migrations/20240101000031_perf_indexes_and_rls_optimization.sql
-- Performance Optimization Migration:
-- 1. High-efficiency composite & partial indexes for webhook ingestion, message history, and lead routing.
-- 2. InitPlan wrapping for RLS policies ((SELECT app.has_permission(...))) to eliminate per-row re-evaluation.
-- 3. Mark auth helpers STABLE + SECURITY DEFINER with fixed search_path.
--
-- ROLLBACK NOTES:
-- To rollback this migration:
-- DROP INDEX IF EXISTS app.idx_messages_conversation_created_at_desc;
-- DROP INDEX IF EXISTS app.idx_messages_external_message_id_unique;
-- DROP INDEX IF EXISTS app.idx_conversations_assigned_status_last_msg;
-- DROP INDEX IF EXISTS app.idx_channel_identities_channel_ext_id;
-- DROP INDEX IF EXISTS app.idx_webhook_events_status_created_at;
-- DROP INDEX IF EXISTS app.idx_leads_status_assigned_created;
-- Re-run RLS policy definitions from 20240101000022_create_messaging_inbox.sql.

-- ═══════════════════════════════════════════════════════════════
-- 1. HIGH-PERFORMANCE INDEXES
-- ═══════════════════════════════════════════════════════════════

-- 1.1 Inbound & Outbound message lookup by conversation in reverse chronological order
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at_desc
  ON app.messages(conversation_id, created_at DESC);

-- 1.2 Table-wide idempotency check for external message IDs (WhatsApp, Messenger, Instagram)
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_message_id_unique
  ON app.messages(external_message_id)
  WHERE external_message_id IS NOT NULL;

-- 1.3 Rapid conversation filtering by sales rep assignment, status, and activity order
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_status_last_msg
  ON app.conversations(assigned_to, status, last_message_at DESC);

-- 1.4 Fast identity resolution by channel provider and external PSID/phone/ID
CREATE INDEX IF NOT EXISTS idx_channel_identities_channel_ext_id
  ON app.channel_identities(channel, external_id);

-- 1.5 Rapid webhook event queue polling & retry filtering
CREATE INDEX IF NOT EXISTS idx_webhook_events_status_created_at
  ON app.webhook_events(status, created_at DESC);

-- 1.6 Lead management queries by status, sales rep, and creation time
CREATE INDEX IF NOT EXISTS idx_leads_status_assigned_created
  ON app.leads(status, assigned_to, created_at DESC);

-- 1.7 Partial indexes for soft-deleted entities
CREATE INDEX IF NOT EXISTS idx_customers_active_id
  ON app.customers(id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_deals_active_id
  ON app.deals(id)
  WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. HARDENED STABLE AUTH & PERMISSION FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.get_current_employee_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT id
  FROM app.employees
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app.is_active_employee()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.employees
    WHERE auth_user_id = auth.uid()
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION app.has_permission(permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.user_roles ur
    JOIN app.role_permissions rp ON rp.role_id = ur.role_id
    JOIN app.permissions p ON p.id = rp.permission_id
    WHERE ur.employee_id = app.get_current_employee_id()
      AND app.is_active_employee()
      AND (p.key = permission_key OR p.key = 'admin.system')
  );
$$;

-- ═══════════════════════════════════════════════════════════════
-- 3. OPTIMIZED RLS POLICIES WITH INITPLAN (SELECT ...) WRAPPING
-- ═══════════════════════════════════════════════════════════════

-- 3.1 Channel Identities
DROP POLICY IF EXISTS channel_identities_select ON app.channel_identities;
CREATE POLICY channel_identities_select ON app.channel_identities
  FOR SELECT TO authenticated
  USING (
    (SELECT app.has_permission('crm.inbox.read_own'))
    OR (SELECT app.has_permission('crm.inbox.read_all'))
  );

DROP POLICY IF EXISTS channel_identities_update ON app.channel_identities;
CREATE POLICY channel_identities_update ON app.channel_identities
  FOR UPDATE TO authenticated
  USING (
    (SELECT app.has_permission('crm.inbox.write'))
  )
  WITH CHECK (
    (SELECT app.has_permission('crm.inbox.write'))
  );

-- 3.2 Conversations (Behavior B for Sales Reps, Full for Admin)
DROP POLICY IF EXISTS conversations_select_own ON app.conversations;
CREATE POLICY conversations_select_own ON app.conversations
  FOR SELECT TO authenticated
  USING (
    assigned_to = (SELECT app.get_current_employee_id())
    AND (SELECT app.has_permission('crm.inbox.read_own'))
  );

DROP POLICY IF EXISTS conversations_select_all ON app.conversations;
CREATE POLICY conversations_select_all ON app.conversations
  FOR SELECT TO authenticated
  USING (
    (SELECT app.has_permission('crm.inbox.read_all'))
  );

DROP POLICY IF EXISTS conversations_update_own ON app.conversations;
CREATE POLICY conversations_update_own ON app.conversations
  FOR UPDATE TO authenticated
  USING (
    assigned_to = (SELECT app.get_current_employee_id())
    AND (SELECT app.has_permission('crm.inbox.write'))
  )
  WITH CHECK (
    assigned_to = (SELECT app.get_current_employee_id())
    AND (SELECT app.has_permission('crm.inbox.write'))
  );

DROP POLICY IF EXISTS conversations_update_all ON app.conversations;
CREATE POLICY conversations_update_all ON app.conversations
  FOR UPDATE TO authenticated
  USING (
    (SELECT app.has_permission('crm.inbox.read_all'))
    AND (SELECT app.has_permission('crm.inbox.write'))
  )
  WITH CHECK (
    (SELECT app.has_permission('crm.inbox.write'))
  );

-- 3.3 Messages
DROP POLICY IF EXISTS messages_select_own ON app.messages;
CREATE POLICY messages_select_own ON app.messages
  FOR SELECT TO authenticated
  USING (
    (SELECT app.has_permission('crm.inbox.read_own'))
    AND EXISTS (
      SELECT 1 FROM app.conversations c
      WHERE c.id = app.messages.conversation_id
        AND c.assigned_to = (SELECT app.get_current_employee_id())
    )
  );

DROP POLICY IF EXISTS messages_select_all ON app.messages;
CREATE POLICY messages_select_all ON app.messages
  FOR SELECT TO authenticated
  USING (
    (SELECT app.has_permission('crm.inbox.read_all'))
  );

DROP POLICY IF EXISTS messages_insert_own ON app.messages;
CREATE POLICY messages_insert_own ON app.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT app.has_permission('crm.inbox.write'))
    AND direction = 'outbound'
    AND EXISTS (
      SELECT 1 FROM app.conversations c
      WHERE c.id = app.messages.conversation_id
        AND c.assigned_to = (SELECT app.get_current_employee_id())
    )
  );

DROP POLICY IF EXISTS messages_insert_all ON app.messages;
CREATE POLICY messages_insert_all ON app.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT app.has_permission('crm.inbox.read_all'))
    AND (SELECT app.has_permission('crm.inbox.write'))
  );

-- 3.4 Message Attachments
DROP POLICY IF EXISTS message_attachments_select ON app.message_attachments;
CREATE POLICY message_attachments_select ON app.message_attachments
  FOR SELECT TO authenticated
  USING (
    (SELECT app.has_permission('crm.inbox.read_all'))
    OR (
      (SELECT app.has_permission('crm.inbox.read_own'))
      AND EXISTS (
        SELECT 1
        FROM app.messages m
        JOIN app.conversations c ON c.id = m.conversation_id
        WHERE m.id = app.message_attachments.message_id
          AND c.assigned_to = (SELECT app.get_current_employee_id())
      )
    )
  );
