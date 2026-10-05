-- supabase/migrations/20240101000003_create_rbac.sql
-- Phase 1: Role-Based Access Control tables
-- Implements roles, permissions, and their relationships.

-- ─── Roles ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE CHECK (char_length(name) > 0),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.roles IS 'System roles (Admin, Sales, Accountant, HR, etc.)';

-- ─── Permissions ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE CHECK (key ~* '^[a-z][a-z0-9_.]+$'),
  description TEXT,
  module      TEXT NOT NULL CHECK (char_length(module) > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permissions_module ON app.permissions(module);
CREATE INDEX IF NOT EXISTS idx_permissions_key ON app.permissions(key);

COMMENT ON TABLE app.permissions IS 'Granular permission keys organized by module';

-- ─── Role ↔ Permission ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.role_permissions (
  role_id       UUID NOT NULL REFERENCES app.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES app.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON app.role_permissions(role_id);

COMMENT ON TABLE app.role_permissions IS 'Many-to-many: which permissions each role has';

-- ─── Employee ↔ Role ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app.user_roles (
  employee_id UUID NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES app.roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_employee_id ON app.user_roles(employee_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON app.user_roles(role_id);

COMMENT ON TABLE app.user_roles IS 'Many-to-many: which roles each employee has';

-- ─── Grant Permissions ──────────────────────────────────────────

GRANT SELECT ON app.roles TO authenticated;
GRANT ALL ON app.roles TO service_role;

GRANT SELECT ON app.permissions TO authenticated;
GRANT ALL ON app.permissions TO service_role;

GRANT SELECT ON app.role_permissions TO authenticated;
GRANT ALL ON app.role_permissions TO service_role;

GRANT SELECT, INSERT, DELETE ON app.user_roles TO authenticated;
GRANT ALL ON app.user_roles TO service_role;
