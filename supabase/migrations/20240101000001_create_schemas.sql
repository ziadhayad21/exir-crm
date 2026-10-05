-- supabase/migrations/20240101000001_create_schemas.sql
-- Phase 1: Create application schemas
-- Separates application data from Supabase system schemas.

-- Application data schema
CREATE SCHEMA IF NOT EXISTS app;

-- Audit schema
CREATE SCHEMA IF NOT EXISTS audit;

-- Grant usage to the authenticated and service_role
GRANT USAGE ON SCHEMA app TO authenticated, service_role;
GRANT USAGE ON SCHEMA audit TO authenticated, service_role;
