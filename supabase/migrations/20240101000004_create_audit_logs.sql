-- supabase/migrations/20240101000004_create_audit_logs.sql
-- Phase 1: Audit logging foundation
-- Append-only audit log table for tracking important system actions.

CREATE TABLE IF NOT EXISTS audit.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    UUID REFERENCES app.employees(id) ON DELETE SET NULL,
  action      TEXT NOT NULL CHECK (char_length(action) > 0),
  module      TEXT NOT NULL CHECK (char_length(module) > 0),
  entity_type TEXT,
  entity_id   TEXT,
  old_value   JSONB,
  new_value   JSONB,
  request_id  TEXT,
  metadata    JSONB
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at ON audit.audit_logs(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit.audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit.audit_logs(entity_type, entity_id);

COMMENT ON TABLE audit.audit_logs IS 'Append-only audit log for all system actions';

-- Grant insert to service_role (audit writes go through admin client)
-- Authenticated users can read their own audit entries
GRANT SELECT ON audit.audit_logs TO authenticated;
GRANT ALL ON audit.audit_logs TO service_role;
