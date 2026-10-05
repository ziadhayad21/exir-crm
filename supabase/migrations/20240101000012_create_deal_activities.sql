-- supabase/migrations/20240101000012_create_deal_activities.sql
-- Phase 2: CRM Core — Deal Activities Table
-- Stores chronological activity timeline for deals (notes, stage changes, calls, meetings).

CREATE TABLE IF NOT EXISTS app.deal_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID NOT NULL REFERENCES app.deals(id) ON DELETE CASCADE,
  actor_id    UUID NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  type        TEXT NOT NULL CHECK (type IN ('note', 'stage_change', 'call', 'email', 'meeting', 'system')),
  content     TEXT NOT NULL CHECK (char_length(content) > 0),
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for deal timeline queries
CREATE INDEX IF NOT EXISTS idx_deal_activities_deal_id ON app.deal_activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_created_at ON app.deal_activities(deal_id, created_at DESC);

-- Comments
COMMENT ON TABLE app.deal_activities IS 'CRM conversation and stage change timeline entries for deals';
COMMENT ON COLUMN app.deal_activities.actor_id IS 'Employee who performed the activity (ON DELETE RESTRICT)';
COMMENT ON COLUMN app.deal_activities.deal_id IS 'Parent deal (ON DELETE CASCADE)';

-- Grants
GRANT SELECT, INSERT ON app.deal_activities TO authenticated;
GRANT ALL ON app.deal_activities TO service_role;
