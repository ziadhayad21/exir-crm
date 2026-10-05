-- supabase/migrations/20240101000010_create_services.sql
-- Phase 2: CRM Core — Services Catalog Table
-- Stores services offered, hardcoded to EGP single currency for Phase 2.

CREATE TABLE IF NOT EXISTS app.services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE CHECK (char_length(name) > 0),
  description TEXT,
  base_price  NUMERIC(12,2) CHECK (base_price IS NULL OR base_price >= 0),
  currency    TEXT NOT NULL DEFAULT 'EGP' CHECK (currency = 'EGP'),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for active status queries
CREATE INDEX IF NOT EXISTS idx_services_is_active ON app.services(is_active);

-- Comments
COMMENT ON TABLE app.services IS 'Services catalog for deals and commercial offerings';
COMMENT ON COLUMN app.services.currency IS 'Fixed to EGP in Phase 2 via CHECK constraint';

-- Grants
GRANT SELECT, INSERT, UPDATE ON app.services TO authenticated;
GRANT ALL ON app.services TO service_role;
