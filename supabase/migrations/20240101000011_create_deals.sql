-- supabase/migrations/20240101000011_create_deals.sql
-- Phase 2: CRM Core — Deals Table
-- Represents commercial opportunities tied to customers, moving through deal stages.

CREATE TABLE IF NOT EXISTS app.deals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL CHECK (char_length(title) > 0),
  customer_id         UUID NOT NULL REFERENCES app.customers(id) ON DELETE RESTRICT,
  service_id          UUID REFERENCES app.services(id) ON DELETE SET NULL,
  assigned_to         UUID NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  stage               TEXT NOT NULL DEFAULT 'new'
                        CHECK (stage IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  value               NUMERIC(12,2) CHECK (value IS NULL OR value >= 0),
  currency            TEXT NOT NULL DEFAULT 'EGP' CHECK (currency = 'EGP'),
  expected_close_date DATE,
  lost_reason         TEXT,
  notes               TEXT,
  created_by          UUID NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Database-level protection: lost_reason required when stage = 'lost'
  CONSTRAINT deals_lost_reason_required
    CHECK (stage <> 'lost' OR (stage = 'lost' AND lost_reason IS NOT NULL AND char_length(lost_reason) > 0)),

  -- Invariant: lost_reason must be cleared when stage != 'lost'
  CONSTRAINT deals_lost_reason_only_when_lost
    CHECK (stage = 'lost' OR lost_reason IS NULL)
);

-- Indexes for performance and pipeline filtering
CREATE INDEX IF NOT EXISTS idx_deals_customer_id ON app.deals(customer_id);
CREATE INDEX IF NOT EXISTS idx_deals_service_id ON app.deals(service_id);
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON app.deals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON app.deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_created_by ON app.deals(created_by);
CREATE INDEX IF NOT EXISTS idx_deals_created_at ON app.deals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_expected_close ON app.deals(expected_close_date) WHERE expected_close_date IS NOT NULL;

-- Comments
COMMENT ON TABLE app.deals IS 'Commercial opportunities moving through pipeline stages';
COMMENT ON COLUMN app.deals.customer_id IS 'Customer contact record owning the deal (ON DELETE RESTRICT)';
COMMENT ON COLUMN app.deals.assigned_to IS 'Employee currently assigned to the deal (ON DELETE RESTRICT)';
COMMENT ON COLUMN app.deals.created_by IS 'Attribution: employee who created the deal record (ON DELETE RESTRICT)';
COMMENT ON COLUMN app.deals.stage IS 'Pipeline state: new, contacted, qualified, proposal, negotiation, won, lost';
COMMENT ON COLUMN app.deals.currency IS 'Fixed to EGP in Phase 2 via CHECK constraint';

-- Grants
GRANT SELECT, INSERT, UPDATE ON app.deals TO authenticated;
GRANT ALL ON app.deals TO service_role;
