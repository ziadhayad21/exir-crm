-- supabase/migrations/20240101000005_create_auth_functions.sql
-- Phase 1: Database-level authorization functions
-- Used by RLS policies to check permissions.
-- SECURITY DEFINER with fixed search_path for security.

-- ─── Get Current Employee ID ────────────────────────────────────
-- Returns the employee ID for the currently authenticated user.
-- Returns NULL if no employee record exists.

CREATE OR REPLACE FUNCTION app.get_current_employee_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT id
  FROM app.employees
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION app.get_current_employee_id() IS 'Returns the employee UUID for the currently authenticated and active Supabase user';

-- ─── Has Permission ─────────────────────────────────────────────
-- Checks if the current user has a specific permission key.
-- Returns true if the user has the permission through any of their roles and is active.

CREATE OR REPLACE FUNCTION app.has_permission(permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.user_roles ur
    JOIN app.role_permissions rp ON rp.role_id = ur.role_id
    JOIN app.permissions p ON p.id = rp.permission_id
    WHERE ur.employee_id = app.get_current_employee_id()
      AND app.is_active_employee()
      AND (p.key = permission_key OR p.key = 'admin.system')
  );
$$;

COMMENT ON FUNCTION app.has_permission(TEXT) IS 'Returns true if the current active user has the given permission key (or admin.system)';

-- ─── Is Active Employee ─────────────────────────────────────────
-- Checks if the current user is an active employee.

CREATE OR REPLACE FUNCTION app.is_active_employee()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM app.employees
    WHERE auth_user_id = auth.uid()
      AND is_active = true
  );
$$;

COMMENT ON FUNCTION app.is_active_employee() IS 'Returns true if the current user is an active employee';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION app.get_current_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION app.has_permission(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION app.is_active_employee() TO authenticated;
