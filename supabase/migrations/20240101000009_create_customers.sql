-- supabase/migrations/20240101000009_create_customers.sql
-- Phase 2: CRM Core — Customers Table
-- Stores CRM customer contact records with soft deduplication support.

CREATE TABLE IF NOT EXISTS app.customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   TEXT NOT NULL CHECK (char_length(full_name) > 0),
  email       TEXT CHECK (email IS NULL OR email ~* '^[^@]+@[^@]+\.[^@]+$'),
  phone       TEXT CHECK (phone IS NULL OR char_length(phone) > 0),
  source      TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual', 'referral', 'walk_in', 'website', 'social_media', 'other')),
  notes       TEXT,
  created_by  UUID NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At least one contact method (email or phone) is required
ALTER TABLE app.customers
  DROP CONSTRAINT IF EXISTS customers_contact_check;
ALTER TABLE app.customers
  ADD CONSTRAINT customers_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_email ON app.customers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON app.customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_source ON app.customers(source);
CREATE INDEX IF NOT EXISTS idx_customers_created_by ON app.customers(created_by);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON app.customers(created_at DESC);

-- Comments
COMMENT ON TABLE app.customers IS 'CRM contact records representing individuals or organizations';
COMMENT ON COLUMN app.customers.created_by IS 'Attribution: employee who created the customer record (ON DELETE RESTRICT)';
COMMENT ON COLUMN app.customers.source IS 'Acquisition channel (manual, referral, walk_in, website, social_media, other)';

-- Grants
GRANT SELECT, INSERT, UPDATE ON app.customers TO authenticated;
GRANT ALL ON app.customers TO service_role;
