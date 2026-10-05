-- supabase/migrations/20240101000006_enable_rls.sql
-- Phase 1: Row Level Security policies
-- Default: deny-by-default on all application tables.
-- Users can only access data they are authorized to access.

-- ═══════════════════════════════════════════════════════════════
-- EMPLOYEES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE app.employees ENABLE ROW LEVEL SECURITY;

-- Employees can view their own record
DROP POLICY IF EXISTS employees_select_own ON app.employees;
CREATE POLICY employees_select_own ON app.employees
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Admins can view all employees
DROP POLICY IF EXISTS employees_select_admin ON app.employees;
CREATE POLICY employees_select_admin ON app.employees
  FOR SELECT TO authenticated
  USING (app.has_permission('admin.system'));

-- Admins can insert employees (via server action using admin client, but policy exists for completeness)
DROP POLICY IF EXISTS employees_insert_admin ON app.employees;
CREATE POLICY employees_insert_admin ON app.employees
  FOR INSERT TO authenticated
  WITH CHECK (app.has_permission('admin.system'));

-- Admins can update employees
DROP POLICY IF EXISTS employees_update_admin ON app.employees;
CREATE POLICY employees_update_admin ON app.employees
  FOR UPDATE TO authenticated
  USING (app.has_permission('admin.system'))
  WITH CHECK (app.has_permission('admin.system'));

-- ═══════════════════════════════════════════════════════════════
-- ROLES (read-only for authenticated users)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE app.roles ENABLE ROW LEVEL SECURITY;

-- All active employees can view roles
DROP POLICY IF EXISTS roles_select ON app.roles;
CREATE POLICY roles_select ON app.roles
  FOR SELECT TO authenticated
  USING (app.is_active_employee());

-- ═══════════════════════════════════════════════════════════════
-- PERMISSIONS (read-only for authenticated users)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE app.permissions ENABLE ROW LEVEL SECURITY;

-- All active employees can view permissions
DROP POLICY IF EXISTS permissions_select ON app.permissions;
CREATE POLICY permissions_select ON app.permissions
  FOR SELECT TO authenticated
  USING (app.is_active_employee());

-- ═══════════════════════════════════════════════════════════════
-- ROLE_PERMISSIONS (read-only for authenticated users)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE app.role_permissions ENABLE ROW LEVEL SECURITY;

-- All active employees can view role-permission mappings
DROP POLICY IF EXISTS role_permissions_select ON app.role_permissions;
CREATE POLICY role_permissions_select ON app.role_permissions
  FOR SELECT TO authenticated
  USING (app.is_active_employee());

-- ═══════════════════════════════════════════════════════════════
-- USER_ROLES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE app.user_roles ENABLE ROW LEVEL SECURITY;

-- Employees can view their own role assignments
DROP POLICY IF EXISTS user_roles_select_own ON app.user_roles;
CREATE POLICY user_roles_select_own ON app.user_roles
  FOR SELECT TO authenticated
  USING (employee_id = app.get_current_employee_id());

-- Admins can view all role assignments
DROP POLICY IF EXISTS user_roles_select_admin ON app.user_roles;
CREATE POLICY user_roles_select_admin ON app.user_roles
  FOR SELECT TO authenticated
  USING (app.has_permission('admin.system'));

-- Admins can assign roles
DROP POLICY IF EXISTS user_roles_insert_admin ON app.user_roles;
CREATE POLICY user_roles_insert_admin ON app.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (app.has_permission('admin.system'));

-- Admins can remove roles
DROP POLICY IF EXISTS user_roles_delete_admin ON app.user_roles;
CREATE POLICY user_roles_delete_admin ON app.user_roles
  FOR DELETE TO authenticated
  USING (app.has_permission('admin.system'));

-- ═══════════════════════════════════════════════════════════════
-- AUDIT_LOGS (read-only for authenticated users, write via service_role)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE audit.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read audit logs
DROP POLICY IF EXISTS audit_logs_select_admin ON audit.audit_logs;
CREATE POLICY audit_logs_select_admin ON audit.audit_logs
  FOR SELECT TO authenticated
  USING (app.has_permission('admin.system'));

-- No authenticated user can insert/update/delete audit logs directly.
-- Audit writes go through the admin client (service_role bypasses RLS).
-- This makes the audit log append-only from the user's perspective.
