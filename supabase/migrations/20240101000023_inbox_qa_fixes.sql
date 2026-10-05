-- supabase/migrations/20240101000023_inbox_qa_fixes.sql
-- Phase 4A QA Fixes:
-- 1. Restrict channel_identities RLS so Sales cannot view or modify other reps' channel identities
-- 2. Add database trigger to synchronize lead assignment changes to linked conversations (preventing stale owners)
-- 3. Refresh schema cache and view permissions

-- ═══════════════════════════════════════════════════════════════
-- 1. CHANNEL IDENTITIES RLS HARDENING (BUG-4A-02 FIX)
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS channel_identities_select ON app.channel_identities;
CREATE POLICY channel_identities_select ON app.channel_identities
  FOR SELECT TO authenticated
  USING (
    -- Admin has full visibility across all identities
    app.has_permission('crm.inbox.read_all')
    OR (
      -- Sales rep can ONLY see identities associated with conversations assigned to them
      app.has_permission('crm.inbox.read_own')
      AND EXISTS (
        SELECT 1 FROM app.conversations c
        WHERE c.channel_identity_id = app.channel_identities.id
          AND c.assigned_to = app.get_current_employee_id()
      )
    )
  );

DROP POLICY IF EXISTS channel_identities_update ON app.channel_identities;
CREATE POLICY channel_identities_update ON app.channel_identities
  FOR UPDATE TO authenticated
  USING (
    (app.has_permission('crm.inbox.read_all') AND app.has_permission('crm.inbox.write'))
    OR (
      app.has_permission('crm.inbox.read_own')
      AND app.has_permission('crm.inbox.write')
      AND EXISTS (
        SELECT 1 FROM app.conversations c
        WHERE c.channel_identity_id = app.channel_identities.id
          AND c.assigned_to = app.get_current_employee_id()
      )
    )
  )
  WITH CHECK (
    (app.has_permission('crm.inbox.read_all') AND app.has_permission('crm.inbox.write'))
    OR (
      app.has_permission('crm.inbox.read_own')
      AND app.has_permission('crm.inbox.write')
      AND EXISTS (
        SELECT 1 FROM app.conversations c
        WHERE c.channel_identity_id = app.channel_identities.id
          AND c.assigned_to = app.get_current_employee_id()
      )
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 2. LEAD ↔ CONVERSATION ASSIGNMENT SYNC TRIGGER (BUG-4A-01 FIX)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app.sync_lead_assignment_to_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
BEGIN
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
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
  AFTER UPDATE OF assigned_to ON app.leads
  FOR EACH ROW
  EXECUTE FUNCTION app.sync_lead_assignment_to_conversation();

-- ═══════════════════════════════════════════════════════════════
-- 3. RECREATE PUBLIC VIEWS TO ENSURE SCHEMA CACHE REFRESH
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.channel_identities WITH (security_invoker = true) AS
  SELECT * FROM app.channel_identities;

CREATE OR REPLACE VIEW public.conversations WITH (security_invoker = true) AS
  SELECT * FROM app.conversations;

CREATE OR REPLACE VIEW public.leads WITH (security_invoker = true) AS
  SELECT * FROM app.leads;

GRANT ALL ON public.channel_identities TO authenticated, service_role;
GRANT ALL ON public.conversations TO authenticated, service_role;
GRANT ALL ON public.leads TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
