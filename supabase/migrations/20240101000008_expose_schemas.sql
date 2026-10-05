-- supabase/migrations/20240101000008_expose_schemas.sql
-- Expose the app and audit schemas through PostgREST API.
-- This allows Supabase client to query app.* tables without schema prefix.

-- Tell PostgREST to expose our custom schemas
-- Note: For Supabase hosted projects, this needs to be configured 
-- in the Supabase Dashboard > Settings > API > Exposed schemas.
-- For local development with supabase cli, this migration handles it.

-- Create views in the public schema that reference the app schema tables.
-- This is the cleanest approach for Supabase compatibility.

CREATE OR REPLACE VIEW public.employees WITH (security_invoker = true) AS SELECT * FROM app.employees;
CREATE OR REPLACE VIEW public.roles WITH (security_invoker = true) AS SELECT * FROM app.roles;
CREATE OR REPLACE VIEW public.permissions WITH (security_invoker = true) AS SELECT * FROM app.permissions;
CREATE OR REPLACE VIEW public.role_permissions WITH (security_invoker = true) AS SELECT * FROM app.role_permissions;
CREATE OR REPLACE VIEW public.user_roles WITH (security_invoker = true) AS SELECT * FROM app.user_roles;
CREATE OR REPLACE VIEW public.audit_logs WITH (security_invoker = true) AS SELECT * FROM audit.audit_logs;

-- Grant access to views
GRANT SELECT, INSERT, UPDATE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;

GRANT SELECT ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;

GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- Enable RLS on the views — these inherit from the underlying tables
-- PostgREST respects base table RLS because the views are created
-- explicitly WITH (security_invoker = true).
