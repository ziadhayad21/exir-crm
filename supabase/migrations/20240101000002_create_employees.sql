-- supabase/migrations/20240101000002_create_employees.sql
-- Phase 1: Employees table
-- Application-level user model connected to Supabase Auth.
-- Supabase Auth handles authentication; this table stores employee profile data.

CREATE TABLE IF NOT EXISTS app.employees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL CHECK (char_length(full_name) > 0),
  email       TEXT NOT NULL UNIQUE CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  phone       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for lookups by auth user ID (used on every request)
CREATE INDEX IF NOT EXISTS idx_employees_auth_user_id ON app.employees(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_employees_email ON app.employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_is_active ON app.employees(is_active);

COMMENT ON TABLE app.employees IS 'Application-level employee/user records linked to Supabase Auth';
COMMENT ON COLUMN app.employees.auth_user_id IS 'References the Supabase Auth user for this employee';

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE ON app.employees TO authenticated;
GRANT ALL ON app.employees TO service_role;
