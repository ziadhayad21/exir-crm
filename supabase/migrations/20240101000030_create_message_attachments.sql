-- supabase/migrations/20240101000030_create_message_attachments.sql
-- Phase 4E: Media Messaging Foundation
-- Creates app.message_attachments, security_invoker public view, Behavior B RLS,
-- Realtime publication, and foreign key / index hardening.

-- 1. Create app.message_attachments table
CREATE TABLE IF NOT EXISTS app.message_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        UUID NOT NULL REFERENCES app.messages(id) ON DELETE CASCADE,
  storage_path      TEXT NOT NULL,
  provider          TEXT NOT NULL CHECK (provider IN ('whatsapp', 'messenger', 'instagram', 'mock', 'local', 'other')),
  external_media_id TEXT,
  media_type        TEXT NOT NULL CHECK (media_type IN ('image', 'audio', 'video', 'document', 'other')),
  mime_type         TEXT NOT NULL,
  file_name         TEXT,
  file_size         BIGINT,
  width             INT,
  height            INT,
  duration_ms       INT,
  caption           TEXT,
  checksum          TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'stored', 'failed')),
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes for fast retrieval & uniqueness
CREATE INDEX IF NOT EXISTS idx_message_attachments_msg_id ON app.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_status ON app.message_attachments(status);
CREATE INDEX IF NOT EXISTS idx_message_attachments_ext_media ON app.message_attachments(provider, external_media_id)
  WHERE external_media_id IS NOT NULL;

-- 3. Row Level Security (RLS) Policies — Matching Behavior B
ALTER TABLE app.message_attachments ENABLE ROW LEVEL SECURITY;

-- 3.1 SELECT Own (Sales sees only media for conversations assigned to them)
DROP POLICY IF EXISTS message_attachments_select_own ON app.message_attachments;
CREATE POLICY message_attachments_select_own ON app.message_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM app.messages m
      JOIN app.conversations c ON c.id = m.conversation_id
      WHERE m.id = app.message_attachments.message_id
        AND c.assigned_to = app.get_current_employee_id()
    )
    AND app.has_permission('crm.inbox.read_own')
  );

-- 3.2 SELECT All (Admin can see all media attachments)
DROP POLICY IF EXISTS message_attachments_select_all ON app.message_attachments;
CREATE POLICY message_attachments_select_all ON app.message_attachments
  FOR SELECT TO authenticated
  USING (
    app.has_permission('crm.inbox.read_all')
  );

-- 3.3 INSERT Own (Sales can insert media for assigned conversations)
DROP POLICY IF EXISTS message_attachments_insert_own ON app.message_attachments;
CREATE POLICY message_attachments_insert_own ON app.message_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app.messages m
      JOIN app.conversations c ON c.id = m.conversation_id
      WHERE m.id = app.message_attachments.message_id
        AND c.assigned_to = app.get_current_employee_id()
    )
    AND app.has_permission('crm.inbox.write')
  );

-- 3.4 INSERT All (Admin can insert media for any conversation)
DROP POLICY IF EXISTS message_attachments_insert_all ON app.message_attachments;
CREATE POLICY message_attachments_insert_all ON app.message_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    app.has_permission('crm.inbox.read_all')
    AND app.has_permission('crm.inbox.write')
  );

-- 3.5 Service Role Policy
DROP POLICY IF EXISTS message_attachments_service_role ON app.message_attachments;
CREATE POLICY message_attachments_service_role ON app.message_attachments
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Public View with Security Invoker
CREATE OR REPLACE VIEW public.message_attachments WITH (security_invoker = true) AS
  SELECT * FROM app.message_attachments;

-- Grants
GRANT ALL ON app.message_attachments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.message_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_attachments TO authenticated, service_role;

-- 5. Add to Supabase Realtime Publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'app' AND tablename = 'message_attachments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE app.message_attachments;
  END IF;
END $$;

ALTER TABLE app.message_attachments REPLICA IDENTITY FULL;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
